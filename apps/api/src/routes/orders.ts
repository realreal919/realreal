import { Router } from "express"
import { z } from "zod"
import { supabase } from "../lib/supabase"
import { requireAuth } from "../middleware/auth"

export const ordersRouter = Router()

const orderItemSchema = z.object({
  variantId: z.string().uuid(),
  qty: z.number().int().positive(),
  unitPrice: z.number().int().positive(),
})

const addressSchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().regex(/^09\d{8}$/),
  addressType: z.enum(["home", "cvs"]),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  cvsStoreId: z.string().optional(),
  cvsType: z.string().optional(),
})

const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1),
  address: addressSchema,
  shippingMethod: z.enum(["home_delivery", "cvs_711", "cvs_family"]),
  paymentMethod: z.enum(["pchomepay", "linepay", "jkopay"]),
  guestEmail: z.string().email().optional(),
  couponCode: z.string().optional(),
})

// POST /orders — create order from cart items
ordersRouter.post("/", async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() }); return
  }

  const { items, address, shippingMethod, paymentMethod, guestEmail, couponCode } = parsed.data
  const userId: string | undefined = res.locals.userId

  const orderNumber = "RR" + Date.now()
  const subtotalCents = items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0)
  const shippingFees: Record<string, number> = { home_delivery: 100, cvs_711: 60, cvs_family: 60 }
  const shippingFeeCents = shippingFees[shippingMethod] ?? 100
  const totalCents = subtotalCents + shippingFeeCents

  // Insert order
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_number: orderNumber,
      user_id: userId ?? null,
      guest_email: userId ? null : (guestEmail ?? null),
      status: "pending_payment",
      shipping_method: shippingMethod,
      payment_method: paymentMethod,
      subtotal_cents: subtotalCents,
      shipping_fee_cents: shippingFeeCents,
      total_cents: totalCents,
      coupon_code: couponCode ?? null,
    })
    .select("id, order_number")
    .single()

  if (orderError || !order) {
    console.error("[orders] insert order failed:", orderError)
    res.status(500).json({ error: "Failed to create order" }); return
  }

  // Insert order items
  const { error: itemsError } = await supabase
    .from("order_items")
    .insert(
      items.map((item) => ({
        order_id: order.id,
        variant_id: item.variantId,
        qty: item.qty,
        unit_price_cents: item.unitPrice,
      }))
    )

  if (itemsError) {
    console.error("[orders] insert order_items failed:", itemsError)
    // Rollback: delete the order
    await supabase.from("orders").delete().eq("id", order.id)
    res.status(500).json({ error: "Failed to create order items" }); return
  }

  // Insert order address
  const { error: addrError } = await supabase
    .from("order_addresses")
    .insert({
      order_id: order.id,
      type: address.type,
      name: address.name,
      phone: address.phone,
      address_type: address.addressType,
      address: address.address ?? null,
      city: address.city ?? null,
      postal_code: address.postalCode ?? null,
      cvs_store_id: address.cvsStoreId ?? null,
      cvs_type: address.cvsType ?? null,
    })

  if (addrError) {
    console.error("[orders] insert order_addresses failed:", addrError)
    // Rollback: delete items and order
    await supabase.from("order_items").delete().eq("order_id", order.id)
    await supabase.from("orders").delete().eq("id", order.id)
    res.status(500).json({ error: "Failed to create order address" }); return
  }

  res.status(201).json({ data: { orderId: order.id, orderNumber: order.order_number } })
})

// GET /orders/:id — get order with items, address, payment status (auth required, must own order)
ordersRouter.get("/:id", requireAuth, async (req, res) => {
  const userId = res.locals.userId as string
  const orderId = req.params.id

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single()

  if (orderError || !order) { res.status(404).json({ error: "Order not found" }); return }
  if (order.user_id !== userId) { res.status(403).json({ error: "Forbidden" }); return }

  const [{ data: items }, { data: addresses }, { data: payments }] = await Promise.all([
    supabase.from("order_items").select("*").eq("order_id", orderId),
    supabase.from("order_addresses").select("*").eq("order_id", orderId),
    supabase.from("payment_transactions").select("*").eq("order_id", orderId).order("created_at", { ascending: false }).limit(1),
  ])

  res.json({
    data: {
      order,
      items: items ?? [],
      address: addresses?.[0] ?? null,
      payment: payments?.[0] ?? null,
    },
  })
})

// GET /orders — list user's orders, paginated (auth required)
ordersRouter.get("/", requireAuth, async (req, res) => {
  const userId = res.locals.userId as string
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10))
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)))
  const from = (page - 1) * limit
  const to = from + limit - 1

  const { data, error, count } = await supabase
    .from("orders")
    .select("id, order_number, status, total_cents, payment_method, shipping_method, created_at", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, to)

  if (error) { res.status(500).json({ error: error.message }); return }

  res.json({
    data: data ?? [],
    pagination: { page, limit, total: count ?? 0 },
  })
})
