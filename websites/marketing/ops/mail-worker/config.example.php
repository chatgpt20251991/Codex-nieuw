<?php
// Copy to config.php outside every public_html directory; owner-only permissions 0600.
// Generate a dedicated random 32-byte token. Store ONLY its SHA-256 hash in Sites.
return ['token' => 'SET_A_DEDICATED_RANDOM_64_CHARACTER_HEX_TOKEN'];
