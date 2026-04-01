-- Seed editable email templates into site_contents
-- Uses {{variable}} placeholders so admins can edit via CMS

INSERT INTO site_contents (key, value) VALUES
(
  'email_order_confirmation',
  '{
    "subject": "訂單確認 #{{orderNumber}}",
    "body_html": "<!DOCTYPE html><html><body style=\"font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px\"><h1 style=\"color:#4a7c59;border-bottom:2px solid #4a7c59;padding-bottom:8px\">誠真生活 RealReal</h1><h2>訂單確認</h2><p>感謝您的訂購！您的訂單編號為 <strong>#{{orderNumber}}</strong></p><table style=\"width:100%;border-collapse:collapse;margin:16px 0\"><thead><tr style=\"background:#f5f5f5\"><th style=\"padding:8px;text-align:left\">商品</th><th style=\"padding:8px\">數量</th><th style=\"padding:8px;text-align:right\">金額</th></tr></thead><tbody>{{itemRows}}</tbody><tfoot><tr><td colspan=\"2\" style=\"padding:8px;font-weight:bold\">總計</td><td style=\"padding:8px;text-align:right;font-weight:bold\">NT${{total}}</td></tr></tfoot></table><p><strong>送貨地址：</strong>{{address}}</p><hr style=\"margin:24px 0;border:none;border-top:1px solid #eee\"><p style=\"font-size:12px;color:#999\">誠真生活股份有限公司 | <a href=\"https://realreal.cc\">realreal.cc</a></p></body></html>"
  }'::jsonb
),
(
  'email_payment_confirmed',
  '{
    "subject": "付款成功 #{{orderNumber}}",
    "body_html": "<!DOCTYPE html><html><body style=\"font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px\"><h1 style=\"color:#4a7c59;border-bottom:2px solid #4a7c59;padding-bottom:8px\">誠真生活 RealReal</h1><h2>付款成功確認</h2><p>您的訂單 <strong>#{{orderNumber}}</strong> 付款成功。</p><table style=\"width:100%;border-collapse:collapse;margin:16px 0\"><tr><td style=\"padding:8px;color:#666\">付款金額</td><td style=\"padding:8px;font-weight:bold\">NT${{amount}}</td></tr><tr><td style=\"padding:8px;color:#666\">付款方式</td><td style=\"padding:8px\">{{method}}</td></tr></table><p>我們將盡快為您安排出貨，請耐心等候。</p><hr style=\"margin:24px 0;border:none;border-top:1px solid #eee\"><p style=\"font-size:12px;color:#999\">誠真生活股份有限公司 | <a href=\"https://realreal.cc\">realreal.cc</a></p></body></html>"
  }'::jsonb
),
(
  'email_order_shipped',
  '{
    "subject": "您的訂單已出貨 #{{orderNumber}}",
    "body_html": "<!DOCTYPE html><html><body style=\"font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px\"><h1 style=\"color:#4a7c59;border-bottom:2px solid #4a7c59;padding-bottom:8px\">誠真生活 RealReal</h1><h2>您的訂單已出貨！</h2><p>訂單 <strong>#{{orderNumber}}</strong> 已於今日出貨。</p><table style=\"width:100%;border-collapse:collapse;margin:16px 0\"><tr><td style=\"padding:8px;color:#666\">物流公司</td><td style=\"padding:8px\">{{carrier}}</td></tr><tr><td style=\"padding:8px;color:#666\">追蹤號碼</td><td style=\"padding:8px;font-weight:bold\">{{trackingNumber}}</td></tr></table><hr style=\"margin:24px 0;border:none;border-top:1px solid #eee\"><p style=\"font-size:12px;color:#999\">誠真生活股份有限公司 | <a href=\"https://realreal.cc\">realreal.cc</a></p></body></html>"
  }'::jsonb
),
(
  'email_tier_upgrade',
  '{
    "subject": "恭喜升級為{{newTier}}！",
    "body_html": "<!DOCTYPE html><html><body style=\"font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px\"><h1 style=\"color:#4a7c59;border-bottom:2px solid #4a7c59;padding-bottom:8px\">誠真生活 RealReal</h1><h2>🎉 恭喜升級為{{newTier}}！</h2><p>感謝您的支持！您已成功升級為 <strong>{{newTier}}</strong>，享有 <strong>{{discountPercent}}折</strong> 會員優惠。</p>{{benefitsSection}}<p><a href=\"https://realreal.cc/shop\" style=\"background:#4a7c59;color:white;padding:10px 20px;border-radius:4px;text-decoration:none;display:inline-block;margin-top:8px\">立即購物享優惠</a></p><hr style=\"margin:24px 0;border:none;border-top:1px solid #eee\"><p style=\"font-size:12px;color:#999\">誠真生活股份有限公司 | <a href=\"https://realreal.cc\">realreal.cc</a></p></body></html>"
  }'::jsonb
),
(
  'email_subscription_billed',
  '{
    "subject": "訂閱扣款成功 — {{planName}}",
    "body_html": "<!DOCTYPE html><html><body style=\"font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px\"><h1 style=\"color:#4a7c59;border-bottom:2px solid #4a7c59;padding-bottom:8px\">誠真生活 RealReal</h1><h2>訂閱扣款成功</h2><p>您的 <strong>{{planName}}</strong> 訂閱已成功扣款。</p><table style=\"width:100%;border-collapse:collapse;margin:16px 0\"><tr><td style=\"padding:8px;color:#666\">扣款金額</td><td style=\"padding:8px;font-weight:bold\">NT${{amount}}</td></tr><tr><td style=\"padding:8px;color:#666\">訂單編號</td><td style=\"padding:8px\">#{{orderNumber}}</td></tr><tr><td style=\"padding:8px;color:#666\">下次扣款日</td><td style=\"padding:8px\">{{nextBillingDate}}</td></tr></table><hr style=\"margin:24px 0;border:none;border-top:1px solid #eee\"><p style=\"font-size:12px;color:#999\">誠真生活股份有限公司 | <a href=\"https://realreal.cc\">realreal.cc</a></p></body></html>"
  }'::jsonb
),
(
  'email_subscription_failed',
  '{
    "subject": "訂閱扣款失敗 — {{planName}}",
    "body_html": "<!DOCTYPE html><html><body style=\"font-family:sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px\"><h1 style=\"color:#4a7c59;border-bottom:2px solid #4a7c59;padding-bottom:8px\">誠真生活 RealReal</h1><h2>⚠️ 訂閱扣款失敗</h2><p>您的 <strong>{{planName}}</strong> 訂閱扣款失敗，請更新付款資訊以避免訂閱中斷。</p><p>系統將於 <strong>{{retryDate}}</strong> 再次嘗試扣款。</p><p><a href=\"{{manageUrl}}\" style=\"background:#e53e3e;color:white;padding:10px 20px;border-radius:4px;text-decoration:none;display:inline-block;margin-top:8px\">更新付款資訊</a></p><hr style=\"margin:24px 0;border:none;border-top:1px solid #eee\"><p style=\"font-size:12px;color:#999\">誠真生活股份有限公司 | <a href=\"https://realreal.cc\">realreal.cc</a></p></body></html>"
  }'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = now();
