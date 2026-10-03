<?php
declare(strict_types=1);

// Install outside every public_html directory. This program never accepts HTTP requests.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
umask(0077);

function atomicJson(string $path, array $value): void {
    $temp = $path . '.' . bin2hex(random_bytes(8)) . '.tmp';
    $handle = fopen($temp, 'xb');
    if ($handle === false) throw new RuntimeException('journal_open');
    try {
        $json = json_encode($value, JSON_THROW_ON_ERROR);
        if (fwrite($handle, $json) !== strlen($json) || !fflush($handle) || !fsync($handle)) {
            throw new RuntimeException('journal_sync');
        }
    } finally { fclose($handle); }
    if (!rename($temp, $path)) throw new RuntimeException('journal_commit');
}

function api(string $token, array $command): array {
    $curl = curl_init('https://eubatterypassport.nl/api/intake/delivery');
    $response = '';
    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($command, JSON_THROW_ON_ERROR),
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token, 'Content-Type: application/json'],
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use (&$response): int {
            if (strlen($response) + strlen($chunk) > 65536) return 0;
            $response .= $chunk;
            return strlen($chunk);
        },
    ]);
    $ok = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    if ($ok === false || ($status !== 200 && !($status === 409 && ($command['action'] ?? '') === 'ack'))) throw new RuntimeException('api_unavailable');
    $decoded = json_decode($response, true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($decoded)) throw new RuntimeException('api_format');
    return $decoded;
}

function validJob(array $job): bool {
    foreach (['id', 'lease'] as $key) {
        if (!isset($job[$key]) || !is_string($job[$key]) || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iD', $job[$key])) return false;
    }
    foreach (['company' => 640, 'email' => 254, 'application' => 160, 'message' => 12000] as $key => $limit) {
        if (!isset($job[$key]) || !is_string($job[$key]) || strlen($job[$key]) > $limit || str_contains($job[$key], "\0")) return false;
    }
    return (bool)filter_var($job['email'], FILTER_VALIDATE_EMAIL) && !preg_match('/[\r\n]/', $job['email']);
}

function deliver(array $job, string $stateDir, callable $send): string {
    if (!validJob($job)) throw new RuntimeException('invalid_job');
    $path = $stateDir . '/' . $job['id'] . '.json';
    $digest = hash('sha256', json_encode([$job['company'], $job['email'], $job['application'], $job['message']], JSON_THROW_ON_ERROR));
    if (is_file($path)) {
        $previous = json_decode(file_get_contents($path), true, 16, JSON_THROW_ON_ERROR);
        if (($previous['digest'] ?? '') !== $digest) throw new RuntimeException('payload_conflict');
        if (($previous['status'] ?? '') === 'accepted') {
            atomicJson($path, array_merge($previous, ['id'=>$job['id'], 'lease'=>$job['lease'], 'acknowledged'=>false]));
            return 'accepted';
        }
        // An interrupted send may already have reached the local mail queue. Require manual reconciliation.
        if (($previous['status'] ?? '') === 'sending' || ($previous['status'] ?? '') === 'uncertain') {
            atomicJson($path, array_merge($previous, ['id'=>$job['id'], 'lease'=>$job['lease'], 'status'=>'uncertain', 'acknowledged'=>false]));
            return 'uncertain';
        }
        if (($previous['status'] ?? '') !== 'retry') throw new RuntimeException('journal_corrupt');
    }
    $receipt = ['id'=>$job['id'], 'lease'=>$job['lease'], 'digest'=>$digest, 'acknowledged'=>false, 'updatedAt'=>gmdate(DATE_ATOM)];
    atomicJson($path, array_merge($receipt, ['status'=>'sending']));
    $reference = 'EUBP-' . strtoupper(substr($job['id'], 0, 8));
    $body = "Nieuwe online intake\n\nReferentie: $reference\nAanvraag-ID: {$job['id']}\nBedrijf: {$job['company']}\nE-mail: {$job['email']}\nToepassing: {$job['application']}\n\nToelichting:\n{$job['message']}\n";
    $headers = [
        'From' => 'EUBatteryPassport <info@eubatterypassport.nl>',
        'Reply-To' => $job['email'],
        'MIME-Version' => '1.0',
        'Content-Type' => 'text/plain; charset=UTF-8',
        'Content-Transfer-Encoding' => 'base64',
        'Message-ID' => '<intake-' . $job['id'] . '@eubatterypassport.nl>',
        'X-EUBP-Request-ID' => $job['id'],
    ];
    $accepted = $send('info@eubatterypassport.nl', 'Online intake ' . $reference, chunk_split(base64_encode($body)), $headers, '-finfo@eubatterypassport.nl');
    $outcome = $accepted ? 'accepted' : 'retry';
    atomicJson($path, array_merge($receipt, ['status'=>$outcome]));
    return $outcome;
}

function flushAcknowledgements(string $stateDir, callable $ack): void {
    foreach (glob($stateDir . '/*.json') as $path) {
        if (!preg_match('/^[0-9a-f-]{36}\.json$/iD', basename($path))) continue;
        $receipt = json_decode(file_get_contents($path), true, 16, JSON_THROW_ON_ERROR);
        if (($receipt['acknowledged'] ?? false) === true) continue;
        $outcome = $receipt['status'] === 'sending' ? 'uncertain' : $receipt['status'];
        if (!in_array($outcome, ['accepted','retry','uncertain'], true)) throw new RuntimeException('journal_corrupt');
        $response = $ack(['action'=>'ack', 'id'=>$receipt['id'], 'lease'=>$receipt['lease'], 'outcome'=>$outcome]);
        if (($response['acknowledged'] ?? false) === true) {
            $receipt['acknowledged'] = true;
            $receipt['status'] = $outcome;
            atomicJson($path, $receipt);
        }
    }
}

function needsAttention(array $status, int $now): bool {
    foreach ($status['counts'] ?? [] as $row) {
        if ($row['status'] === 'uncertain' && $row['total'] > 0) return true;
    }
    return isset($status['oldestUnacceptedAt']) && $status['oldestUnacceptedAt'] < ($now - 1800) * 1000;
}

// Unit tests import the functions without running the operational worker.
if (defined('EUBP_WORKER_TEST')) return;

try {
    if (PHP_VERSION_ID < 80200 || !function_exists('curl_init') || !function_exists('mail') || !function_exists('fsync')) throw new RuntimeException('runtime_requirements');
    $stateDir = __DIR__ . '/state';
    if (!is_dir($stateDir) && !mkdir($stateDir, 0700)) throw new RuntimeException('state_directory');
    if (!is_writable($stateDir)) throw new RuntimeException('state_not_writable');
    $lock = fopen($stateDir . '/worker.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) exit(0);
    $configPath = __DIR__ . '/config.php';
    if (!is_file($configPath) || (fileperms($configPath) & 0077) !== 0) throw new RuntimeException('private_configuration_required');
    $config = require $configPath;
    $token = $config['token'] ?? '';
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/D', $token)) throw new RuntimeException('configuration_required');
    $ack = static fn(array $command): array => api($token, $command);
    // Retry acknowledgements before claiming another job, including after the last allowed attempt.
    flushAcknowledgements($stateDir, $ack);
    for ($i = 0; $i < 3; $i++) {
        $result = api($token, ['action' => 'claim']);
        if (!array_key_exists('intake', $result)) throw new RuntimeException('api_format');
        if ($result['intake'] === null) break;
        $job = $result['intake'];
        if (!is_array($job) || !validJob($job)) throw new RuntimeException('invalid_job');
        $outcome = deliver($job, $stateDir, 'mail');
        flushAcknowledgements($stateDir, $ack);
    }
    // Operational report contains counts/times only, never request content or tokens.
    $status = api($token, ['action' => 'status']);
    atomicJson($stateDir . '/health.json', ['checkedAt' => gmdate(DATE_ATOM), 'status' => $status]);
    if (needsAttention($status, time())) throw new RuntimeException('manual_reconciliation_required');
} catch (Throwable $error) {
    // Cron must deliver this generic alert to info@. At most one alert/day; no PII or secrets.
    $alert = __DIR__ . '/state/alert-date.txt';
    $today = gmdate('Y-m-d');
    if (!is_file($alert) || trim((string)file_get_contents($alert)) !== $today) {
        fwrite(STDERR, "EUBatteryPassport: intakeverwerking vereist controle. Bekijk de private wachtrijstatus en het verzendlogboek voordat je berichten opnieuw verstuurt.\n");
        if (is_dir(dirname($alert))) file_put_contents($alert, $today, LOCK_EX);
    }
    exit(1);
}
