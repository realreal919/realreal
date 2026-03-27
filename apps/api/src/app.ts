import express, { type Request, type Response, type NextFunction } from "express"
import healthRouter from "./routes/health"
import { categoriesRouter } from "./routes/categories"
import { productsRouter } from "./routes/products"
import { variantsRouter } from "./routes/variants"

export const app = express()
app.use(express.json())
app.use("/health", healthRouter)
app.use("/categories", categoriesRouter)
app.use("/products/:id/variants", variantsRouter)
app.use("/products", productsRouter)
app.use((_req, res) => { res.status(404).json({ error: "Not found" }) })
// Global error handler (must have 4 args for Express to treat it as error handler)
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ error: "Internal server error" })
})
