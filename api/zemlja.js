// ============================================================
// GET /api/zemlja
// Vraca zemlju posetioca po IP adresi, da forma sama izabere pozivni
// broj. Vercel to vec zna (zaglavlje x-vercel-ip-country), pa ne zovemo
// nikakav spoljni servis i IP ne napusta Vercel.
// ============================================================

import { json } from "./_lib.js";

export default function handler(req, res) {
  const kod = String(req.headers["x-vercel-ip-country"] || "").toUpperCase();
  json(res, 200, { zemlja: /^[A-Z]{2}$/.test(kod) ? kod : null });
}
