<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit;
define('EUBP_WORKER_TEST', true);
require __DIR__ . '/worker.php';
function check(bool $condition, string $name): void { if (!$condition) throw new RuntimeException('Failed: ' . $name); }
$dir = sys_get_temp_dir() . '/eubp-worker-test-' . bin2hex(random_bytes(8));
mkdir($dir, 0700);
$job = ['id'=>'deea53d7-6650-4cab-8f53-5b99b5c3298a','lease'=>'ae4b4594-b5c7-46c8-95d3-b1d9986f9b36','company'=>'Testbedrijf','email'=>'test@example.com','application'=>'Energieopslag','message'=>'Test zonder verzending'];
$calls = 0;
$send = static function($to,$subject,$body,$headers,$params) use (&$calls): bool {
    $calls++;
    check($to === 'info@eubatterypassport.nl', 'fixed recipient');
    check($headers['Reply-To'] === 'test@example.com', 'reply to');
    check($params === '-finfo@eubatterypassport.nl', 'fixed envelope');
    check(str_contains(base64_decode($body), 'Test zonder verzending'), 'plain text body');
    return true;
};
check(deliver($job,$dir,$send)==='accepted', 'initial acceptance');
check(deliver($job,$dir,$send)==='accepted' && $calls===1, 'no duplicate after lost ack');
$different=$job;$different['message']='Changed';
try { deliver($different,$dir,$send); throw new RuntimeException('conflict allowed'); } catch (RuntimeException $e) { check($e->getMessage()==='payload_conflict','payload conflict'); }
$inject=$job;$inject['email']="a@example.com\r\nBcc: b@example.com";
check(!validJob($inject),'header injection rejected');
$retry=$job;$retry['id']='b5cb9073-54e0-481b-a125-3c5d2e6c0fae';
check(deliver($retry,$dir,static fn()=>false)==='retry','mail rejection');
check(deliver($retry,$dir,$send)==='accepted','retry recovery');
$crash=$job;$crash['id']='a5bf4695-764b-4362-8ba5-c4f5c3a4f524';
try { deliver($crash,$dir,static function(){throw new RuntimeException('crash');}); } catch (RuntimeException $e) { check($e->getMessage()==='crash','simulated crash'); }
check(deliver($crash,$dir,$send)==='uncertain' && $calls===2,'uncertain sends are not duplicated');
$acks = 0;
try { flushAcknowledgements($dir,static function() {throw new RuntimeException('network failure');}); } catch(RuntimeException $e) { check($e->getMessage()==='network failure','ack network failure'); }
flushAcknowledgements($dir,static function($command) use (&$acks): array { check(isset($command['id'],$command['lease'],$command['outcome']),'durable ack fields'); $acks++; return ['acknowledged'=>true]; });
check($acks===3 && $calls===2,'restart reconciles acknowledgements without resending');
flushAcknowledgements($dir,static function(): array {throw new RuntimeException('already acknowledged');});
check(needsAttention(['counts'=>[['status'=>'uncertain','total'=>1]]],time()),'uncertain requires operator alert');
check(needsAttention(['oldestUnacceptedAt'=>(time()-1900)*1000],time()),'queue backlog requires alert');
check(!needsAttention(['counts'=>[['status'=>'accepted','total'=>1]],'oldestUnacceptedAt'=>null],time()),'healthy queue');
echo "PASS: fixed recipient, Reply-To, repeat/ack-loss, payload conflict, header injection, safe retry, uncertain crash. No mail sent.\n";
