import express, { type Request, type Response, type NextFunction } from "express"
import healthRouter from "./routes/health"
import { categoriesRouter } from "./routes/categories"
import { productsRouter } from "./routes/products"
import { variantsRouter } from "./routes/variants"
import { couponsRouter } from "./routes/coupons"
import { analyticsRouter } from "./routes/analytics"
import { invoicesRouter } from "./routes/invoices"
import { amegoWebhookRouter } from "./routes/webhooks/amego"
import { requireAuth } from "./middleware/auth"
import { requireAdmin } from "./middleware/admin"
import { ordersRouter } from "./routes/orders"
import { pchomepayWebhookRouter } from "./routes/webhooks/pchomepay"
import { linepayWebhookRouter } from "./routes/webhooks/linepay"
import { jkopayWebhookRouter } from "./routes/webhooks/jkopay"
import { ecpayLogisticsWebhookRouter } from "./routes/webhooks/ecpay-logistics"
import { subscriptionPlansRouter, subscriptionsRouter } from "./routes/subscriptions"
import { pchomepayTokenWebhookRouter } from "./routes/webhooks/pchomepay-token"

export const app = express()

// Raw body parser for webhook routes that need form-encoded bodies
// (PChomePay and ECPay Logistics use application/x-www-form-urlencoded)
// Must be registered BEFORE express.json() so these routes get the right parser
app.use("/webhooks/pchomepay", express.urlencoded({ extended: false }))
app.use("/webhooks/ecpay-logistics", express.urlencoded({ extended: false }))

app.use(express.json())
app.use("/health", healthRouter)
app.use("/categories", categoriesRouter)
app.use("/products/:id/variants", variantsRouter)
app.use("/products", productsRouter)
app.use("/", couponsRouter)
app.use("/", analyticsRouter)
app.use("/admin/invoices", requireAuth, requireAdmin, invoicesRouter)
app.use("/webhooks/amego", amegoWebhookRouter)
app.use("/orders", ordersRouter)
app.use("/webhooks/pchomepay", pchomepayWebhookRouter)
app.use("/webhooks/linepay", linepayWebhookRouter)
app.use("/webhooks/jkopay", jkopayWebhookRouter)
app.use("/webhooks/ecpay-logistics", ecpayLogisticsWebhookRouter)
app.use("/subscription-plans", subscriptionPlansRouter)
app.use("/subscriptions", requireAuth, subscriptionsRouter)
app.use("/webhooks/pchomepay-token", pchomepayTokenWebhookRouter)
app.use((_req, res) => { res.status(404).json({ error: "Not found" }) })
// Global error handler (must have 4 args for Express to treat it as error handler)
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ error: "Internal server error" })
})
