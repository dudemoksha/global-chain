import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WarehouseDTO = {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  capacity_units: number;
};

export const listWarehouses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WarehouseDTO[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("warehouses")
      .select("id, name, address, city, country, lat, lng, capacity_units")
      .eq("owner_id", userId)
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as WarehouseDTO[];
  });

/** Geocode a free-form address using OpenStreetMap Nominatim (no key required). */
async function geocode(query: string): Promise<{
  lat: number; lng: number; display_name: string; city: string; country: string;
} | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "GlobalChain/1.0 (supply-chain-risk-app)",
        "Accept-Language": "en",
      },
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{
      lat: string; lon: string; display_name: string;
      address?: { city?: string; town?: string; village?: string; state?: string; country?: string };
    }>;
    if (!arr.length) return null;
    const hit = arr[0];
    const addr = hit.address ?? {};
    return {
      lat: parseFloat(hit.lat),
      lng: parseFloat(hit.lon),
      display_name: hit.display_name,
      city: addr.city || addr.town || addr.village || addr.state || "",
      country: addr.country || "",
    };
  } catch {
    return null;
  }
}

/** Search real-world addresses; used by the "add warehouse" autocomplete.
 *  Biased to populated places (cities, towns, villages) instead of POIs
 *  like airports, hotels, or shops. */
export const searchAddresses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().min(2).max(160) }).parse(d))
  .handler(async ({ data }) => {
    try {
      // layer=address restricts to admin/settlement hits and drops POIs.
      const url =
        `https://nominatim.openstreetmap.org/search?format=json&limit=8` +
        `&addressdetails=1&layer=address&dedupe=1` +
        `&q=${encodeURIComponent(data.q)}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "GlobalChain/1.0", "Accept-Language": "en" },
      });
      if (!res.ok) return [];
      const arr = (await res.json()) as Array<{
        place_id: number; lat: string; lon: string; display_name: string;
        class?: string; type?: string;
        address?: {
          city?: string; town?: string; village?: string; hamlet?: string;
          municipality?: string; suburb?: string; county?: string;
          state?: string; country?: string;
        };
      }>;

      // Whitelist real places; drop airports, aeroways, amenities, tourism, shops, etc.
      const allowedClass = new Set(["place", "boundary", "landuse"]);
      const cleaned = arr
        .filter((h) => {
          const a = h.address ?? {};
          const hasSettlement =
            a.city || a.town || a.village || a.hamlet || a.municipality || a.suburb;
          const goodClass = h.class ? allowedClass.has(h.class) : true;
          return hasSettlement && goodClass;
        })
        .map((h) => {
          const a = h.address ?? {};
          const city =
            a.city || a.town || a.village || a.hamlet || a.municipality || a.suburb || "";
          const region = a.county || a.state || "";
          const country = a.country || "";
          const label = [city, region, country].filter(Boolean).join(", ") || h.display_name;
          return {
            id: String(h.place_id),
            label,
            lat: parseFloat(h.lat),
            lng: parseFloat(h.lon),
            city,
            country,
          };
        });
      return cleaned.slice(0, 6);
    } catch {
      return [];
    }
  });

const warehouseInput = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(3).max(240),
  city: z.string().trim().max(80).default(""),
  country: z.string().trim().max(80).default(""),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  capacity_units: z.number().int().min(0).max(1_000_000_000).default(0),
});

export const addWarehouse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => warehouseInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let { lat, lng, city, country, address } = data;
    if (lat == null || lng == null) {
      const geo = await geocode(address);
      if (!geo) throw new Error("Address could not be located. Please enter a real, more specific address.");
      lat = geo.lat; lng = geo.lng;
      if (!city) city = geo.city;
      if (!country) country = geo.country;
    }
    const { data: row, error } = await supabase
      .from("warehouses")
      .insert({
        owner_id: userId,
        name: data.name,
        address, city, country,
        lat, lng,
        capacity_units: data.capacity_units,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

export const updateWarehouse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    warehouseInput.partial().extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, ...rest } = data;
    const { error } = await supabase
      .from("warehouses")
      .update(rest)
      .eq("id", id)
      .eq("owner_id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const removeWarehouse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("warehouses")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", userId);
    if (error) throw error;
    return { ok: true };
  });
