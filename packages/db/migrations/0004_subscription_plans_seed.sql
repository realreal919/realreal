-- Subscription plans seed
INSERT INTO subscription_plans (name, type, interval, price, is_active) VALUES
  ('月訂單品補充', 'replenishment', 'monthly', 990.00, true),
  ('雙月訂單品補充', 'replenishment', 'bimonthly', 1800.00, true),
  ('月訂健康禮盒', 'membership', 'monthly', 1490.00, true)
ON CONFLICT DO NOTHING;

-- pgcrypto token encryption/decryption functions
CREATE OR REPLACE FUNCTION encrypt_token(plain_text TEXT, encryption_key TEXT)
RETURNS TEXT AS $$
  SELECT pgp_sym_encrypt(plain_text, encryption_key)
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrypt_token(cipher_text TEXT, encryption_key TEXT)
RETURNS TEXT AS $$
  SELECT pgp_sym_decrypt(cipher_text::bytea, encryption_key)
$$ LANGUAGE sql SECURITY DEFINER;

REVOKE ALL ON FUNCTION encrypt_token FROM PUBLIC;
REVOKE ALL ON FUNCTION decrypt_token FROM PUBLIC;
