import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

const registerInput = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string(),
  jobTitle: z.string(),
  legalName: z.string(),
  hqCountry: z.string(),
  industry: z.string(),
  tierRole: z.string(),
  note: z.string(),
});

/** Server-side registration using admin API — bypasses email entirely, no rate limits. */
export const registerUser = createServerFn({ method: 'POST' })
  .validator((data: unknown) => registerInput.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    // Create user with email already confirmed — no confirmation email is sent
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.fullName,
        job_title: data.jobTitle,
        legal_name: data.legalName,
        hq_country: data.hqCountry,
        industry: data.industry,
        tier_role: data.tierRole,
        note: data.note,
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    return { userId: created.user.id };
  });
