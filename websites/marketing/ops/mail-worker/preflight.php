<?php
// Read-only capability check; no messages sent and no credentials used.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
umask(0077);
$report = [
    'checkedAt' => gmdate(DATE_ATOM),
    'php' => PHP_VERSION,
    'curl' => function_exists('curl_init'),
    'mail' => function_exists('mail'),
    'fsync' => function_exists('fsync'),
    'privateDirectoryWritable' => is_writable(__DIR__),
];
if (function_exists('curl_init')) {
    $ch = curl_init('https://eubatterypassport.nl/api/intake/delivery');
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => '{}', CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_TIMEOUT => 20, CURLOPT_FOLLOWLOCATION => false, CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2]);
    $response = curl_exec($ch);
    $report['httpsConnected'] = $response !== false;
    $report['unauthenticatedHttpStatus'] = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
}
file_put_contents(__DIR__ . '/preflight.json', json_encode($report, JSON_PRETTY_PRINT), LOCK_EX);
