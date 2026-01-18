import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const NOTIFY_EMAIL = "meloshaya02@gmail.com";

interface LeadData {
  name: string;
  email: string;
  phone?: string;
  business_name?: string;
  business_type?: string;
  employee_count?: string;
  annual_revenue?: string;
  ownership_type?: string;
  interest?: string;
  lead_magnet?: string;
}

function formatEmployeeCount(value: string): string {
  const mapping: Record<string, string> = {
    "solo-no-revenue": "Just me, no revenue",
    "solo-some-revenue": "Just me, some revenue",
    "me-and-vendors": "Me and vendors",
    "2-4": "2 to 4 employees",
    "5-9": "5 to 9 employees",
    "10-19": "10 to 19 employees",
    "20-49": "20 to 49 employees",
    "50-99": "50 to 99 employees",
    "100-249": "100 to 249 employees",
    "250-500": "250 to 500 employees",
  };
  return mapping[value] || value;
}

function formatRevenue(value: string): string {
  const mapping: Record<string, string> = {
    "under-100k": "Under $100k",
    "100k-250k": "$100k to $250k",
    "250k-500k": "$250k to $500k",
    "500k-1m": "$500k to $1M",
    "1m-3m": "$1M to $3M",
    "3m-10m": "$3M to $10M",
    "10m-30m": "$10M to $30M",
    "30m-plus": "$30 Million+",
  };
  return mapping[value] || value;
}

function formatOwnership(value: string): string {
  const mapping: Record<string, string> = {
    "majority-owner": "Majority owner (>51%)",
    "5050-partner": "50/50 partner",
    "minority-owner": "Minority owner (<50%)",
    "employee": "Employee",
  };
  return mapping[value] || value;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const lead: LeadData = await req.json();

    const emailBody = `
NEW LEAD CAPTURED - InstelTech

=====================================
CONTACT INFORMATION
=====================================
Name: ${lead.name}
Email: ${lead.email}
Phone: ${lead.phone || "Not provided"}

=====================================
BUSINESS INFORMATION
=====================================
Business Name: ${lead.business_name || "Not provided"}
Business Type: ${lead.business_type || "Not provided"}
Employees: ${lead.employee_count ? formatEmployeeCount(lead.employee_count) : "Not provided"}
Annual Revenue: ${lead.annual_revenue ? formatRevenue(lead.annual_revenue) : "Not provided"}
Ownership: ${lead.ownership_type ? formatOwnership(lead.ownership_type) : "Not provided"}

=====================================
LEAD SOURCE
=====================================
Interest: ${lead.interest || "Not specified"}
Lead Magnet: ${lead.lead_magnet || "None"}

=====================================
ACTION REQUIRED
=====================================
Contact this lead within 24 hours!

Reply directly to this email to reach the lead at: ${lead.email}
Or call/WhatsApp: ${lead.phone || "No phone provided"}

---
This notification was sent automatically from insteltech.co.zw
    `.trim();

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "InstelTech Leads <leads@insteltech.co.zw>",
          to: [NOTIFY_EMAIL],
          reply_to: lead.email,
          subject: `New Lead: ${lead.name} - ${lead.business_name || "New Business"}`,
          text: emailBody,
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        console.error("Resend API error:", error);
      }
    } else {
      console.log("No RESEND_API_KEY found. Email would be sent to:", NOTIFY_EMAIL);
      console.log("Email content:", emailBody);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Notification processed" }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error processing notification:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to process notification" }),
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
