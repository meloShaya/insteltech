import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const NOTIFY_EMAIL = "meloshaya02@gmail.com";

interface GiveawayEntryData {
  name: string;
  email: string;
  phone: string;
  whatsapp_number: string;
  business_name: string;
  business_type: string;
  annual_revenue: string;
  employee_count: string;
  current_challenges: string;
  why_should_they_win: string;
  biggest_business_goal: string;
  timeline_urgency: string;
  referral_code: string;
  entry_score: number;
  qualifying_actions_completed: Record<string, boolean>;
  joined_whatsapp_channel: boolean;
  email_verified: boolean;
  shared_facebook: boolean;
  shared_linkedin: boolean;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referred_by_code?: string;
  agree_marketing: boolean;
  ip_address?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const entryData: GiveawayEntryData = await req.json();

    let referrerEmail = null;

    if (entryData.referred_by_code) {
      const { data: referrerData } = await supabase
        .from("giveaway_entries")
        .select("email")
        .eq("referral_code", entryData.referred_by_code)
        .maybeSingle();

      if (referrerData) {
        referrerEmail = referrerData.email;
      }
    }

    const isQualified = entryData.joined_whatsapp_channel && entryData.entry_score >= 10;

    const { data: insertedEntry, error: insertError } = await supabase
      .from("giveaway_entries")
      .insert({
        name: entryData.name,
        email: entryData.email,
        phone: entryData.phone,
        whatsapp_number: entryData.whatsapp_number,
        business_name: entryData.business_name,
        business_type: entryData.business_type,
        annual_revenue: entryData.annual_revenue,
        employee_count: entryData.employee_count,
        current_challenges: entryData.current_challenges,
        why_should_they_win: entryData.why_should_they_win,
        biggest_business_goal: entryData.biggest_business_goal,
        timeline_urgency: entryData.timeline_urgency,
        referral_code: entryData.referral_code,
        referred_by_email: referrerEmail,
        qualifying_actions_completed: entryData.qualifying_actions_completed,
        joined_whatsapp_channel: entryData.joined_whatsapp_channel,
        email_verified: entryData.email_verified,
        shared_facebook: entryData.shared_facebook,
        shared_linkedin: entryData.shared_linkedin,
        entry_score: entryData.entry_score,
        is_qualified: isQualified,
        utm_source: entryData.utm_source,
        utm_medium: entryData.utm_medium,
        utm_campaign: entryData.utm_campaign,
        ip_address: entryData.ip_address,
        status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(insertError.message);
    }

    if (referrerEmail) {
      await supabase.from("giveaway_referrals").insert({
        referrer_email: referrerEmail,
        referrer_code: entryData.referred_by_code,
        referred_email: entryData.email,
        referral_qualified: isQualified,
        referral_status: isQualified ? "qualified" : "pending",
      });
    }

    const emailBody = `
🎉 NEW GIVEAWAY ENTRY - Ultimate AI Business Assistant Giveaway

=====================================
CONTACT INFORMATION
=====================================
Name: ${entryData.name}
Email: ${entryData.email}
Phone: ${entryData.phone}
WhatsApp: ${entryData.whatsapp_number}

=====================================
BUSINESS INFORMATION
=====================================
Business Name: ${entryData.business_name}
Business Type: ${entryData.business_type}
Annual Revenue: ${entryData.annual_revenue}
Employees: ${entryData.employee_count}

=====================================
QUALIFICATION RESPONSES
=====================================
Current Challenges:
${entryData.current_challenges}

Why They Should Win:
${entryData.why_should_they_win}

Biggest Business Goal:
${entryData.biggest_business_goal}

Why Now:
${entryData.timeline_urgency}

=====================================
ENTRY DETAILS
=====================================
Entry Score: ${entryData.entry_score} points
Qualified: ${isQualified ? "YES ✓" : "NO"}
Referral Code: ${entryData.referral_code}
Referred By: ${referrerEmail || "Direct Entry"}

Qualifying Actions Completed:
- WhatsApp Channel: ${entryData.joined_whatsapp_channel ? "✓" : "✗"}
- Facebook Share: ${entryData.shared_facebook ? "✓" : "✗"}
- LinkedIn Share: ${entryData.shared_linkedin ? "✓" : "✗"}

=====================================
TRAFFIC SOURCE
=====================================
Source: ${entryData.utm_source || "Direct"}
Medium: ${entryData.utm_medium || "N/A"}
Campaign: ${entryData.utm_campaign || "N/A"}
IP Address: ${entryData.ip_address || "Unknown"}

=====================================
MARKETING CONSENT
=====================================
Opted in for marketing: ${entryData.agree_marketing ? "YES" : "NO"}

---
This is an automated notification from the InstelTech Giveaway System.
Entry Date: ${new Date().toLocaleString()}
    `.trim();

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (RESEND_API_KEY) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "InstelTech Giveaway <giveaway@insteltech.co.zw>",
          to: [NOTIFY_EMAIL],
          subject: `🎉 New Giveaway Entry: ${entryData.name} (${entryData.entry_score} pts)`,
          text: emailBody,
        }),
      });
    } else {
      console.log("Email notification:", emailBody);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Entry submitted successfully",
        data: {
          referral_code: entryData.referral_code,
          entry_score: entryData.entry_score,
          is_qualified: isQualified,
        },
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error processing giveaway entry:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Failed to submit entry",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});