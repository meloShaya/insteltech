const ago = (n) => new Date(Date.now() - n * 86400000).toISOString();
export function demoData() {
  const people = [
    ["Tendai", "Moyo", "Mavambo Studio", "Managing Director", "proposal", 4200],
    ["Rudo", "Dube", "Evergreen Wellness", "Founder", "qualified", 1800],
    [
      "Farai",
      "Ndlovu",
      "Northstar Logistics",
      "Operations Director",
      "meeting",
      6500,
    ],
    ["Chipo", "Banda", "Forma Architects", "Principal", "contacted", 3200],
    ["Tinashe", "Sibanda", "Harvest & Co.", "Co-founder", "new", 2400],
    [
      "Nyasha",
      "Chirwa",
      "Atlas Engineering",
      "Business Development",
      "won",
      5800,
    ],
    [
      "Kudzai",
      "Ncube",
      "Mosaic Interiors",
      "Creative Director",
      "qualified",
      2100,
    ],
    ["Tatenda", "Mare", "Bluebird Travel", "Marketing Lead", "new", 1600],
    ["Rutendo", "Sithole", "Acacia Consulting", "Partner", "contacted", 3400],
    ["Simba", "Zhou", "Brightpath Learning", "Founder", "meeting", 2800],
    ["Nokutenda", "Dhlamini", "Fieldwork Digital", "Director", "new", 1900],
    [
      "Tariro",
      "Mupfumi",
      "Stonebridge Group",
      "Operations Lead",
      "qualified",
      4600,
    ],
  ];
  const contacts = people.map(
    ([first_name, last_name, company, title, stage, value], i) => ({
      id: `demo-contact-${i}`,
      first_name,
      last_name,
      company,
      title,
      stage,
      value,
      email: `${first_name.toLowerCase()}@${company.toLowerCase().replace(/[^a-z]/g, "")}.example`,
      website: "",
      consent: i % 3 !== 0,
      consent_note: i % 3 !== 0 ? "Sample: opted in at a business event" : "",
      suppressed: false,
      source: i % 2 ? "Business event" : "Referral",
      notes: "",
      created_at: ago(i + 1),
      updated_at: ago(i),
      next_action_at: ago(-i % 4).slice(0, 10),
    }),
  );
  const campaigns = [
    {
      id: "demo-campaign-1",
      name: "A better digital first impression",
      status: "active",
      subject: "A next step for {{company}}",
      body: "Hi {{first_name}},\n\nThanks for connecting with us. We help ambitious teams turn their websites into a better introduction to their business.\n\nWould a short website review be useful this week?\n\nTendai\nInstel Technologies",
      audience_stage: "qualified",
      created_at: ago(12),
    },
    {
      id: "demo-campaign-2",
      name: "The local business growth series",
      status: "draft",
      subject: "Your next chapter, {{first_name}}",
      body: "Hi {{first_name}},\n\nFollowing up on your interest in our growth series. What is the one thing you would like your website to do better?\n\nThe Instel team",
      audience_stage: "new",
      created_at: ago(3),
    },
  ];
  const recipients = contacts
    .slice(0, 7)
    .map((c, i) => ({
      id: `demo-recipient-${i}`,
      contact_id: c.id,
      campaign_id: campaigns[0].id,
      status: i < 5 ? "sent" : "pending",
      reply_sentiment: i < 2 ? "positive" : i === 2 ? "neutral" : "none",
      sent_at: i < 5 ? ago(i + 1) : null,
    }));
  return {
    contacts,
    campaigns,
    recipients,
    jobs: [
      {
        id: "demo-job-1",
        title: "Find the right starting point",
        workflow_id: "cold-email-kickoff",
        input: {},
        status: "completed",
        output:
          "DEMO RESULT\n\nStart with locally owned service businesses that already have a website and a clear decision maker. Offer a short, specific website review.\n\n1. Record your ideal customer profile.\n2. Build and qualify a focused list.\n3. Prepare a value-led introduction.\n4. Review the audience and sender before launch.\n\nThis is a sample artifact, not an AI execution.",
        created_at: ago(1),
      },
    ],
    notes: [
      {
        id: "demo-note-1",
        contact_id: contacts[0].id,
        body: "Sample note: interested in refreshing their website before the next launch. Send a focused proposal.",
        created_at: ago(1),
      },
    ],
    tasks: [
      {
        id: "demo-task-1",
        title: "Follow up on the Mavambo proposal",
        due_at: ago(0).slice(0, 10),
        completed: false,
      },
      {
        id: "demo-task-2",
        title: "Review this week’s positive replies",
        due_at: ago(0).slice(0, 10),
        completed: false,
      },
      {
        id: "demo-task-3",
        title: "Qualify the new referral list",
        due_at: ago(-1).slice(0, 10),
        completed: false,
      },
    ],
    experiments: [],
    settings: {
      id: true,
      company_name: "Instel Technologies",
      website: "https://insteltech.co.zw",
      offer:
        "Thoughtful websites, software, and digital systems for growing businesses.",
      audience: "Ambitious service businesses in Zimbabwe.",
      physical_address: "",
      unsubscribe_email: "info@insteltech.co.zw",
    },
    workers: [],
  };
}
