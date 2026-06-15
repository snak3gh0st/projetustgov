import { query } from '@/lib/db'
import { ok } from '@/lib/http'

export const dynamic = 'force-dynamic'

export async function GET() {
  const rows = await query(`
    SELECT id, slug, title, subtitle, cover_image_url, product_type, default_price_cents,
      (SELECT COUNT(*) FROM education_lessons l
         JOIN education_modules m ON m.id = l.module_id
         WHERE m.product_id = education_products.id AND l.status = 'published')::int AS lesson_count
    FROM education_products
    WHERE status = 'published' AND visibility = 'public'
    ORDER BY created_at DESC NULLS LAST
  `)
  return ok(rows)
}
