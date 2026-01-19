# Ultimate AI Business Assistant Giveaway - Documentation

## Overview

This is a complete Grand Slam Giveaway system designed to generate qualified leads through a prize-based competition. The prize is a $2,500 Ultimate AI Business Assistant with full features.

## Campaign Structure

### Prize Details
- **Grand Prize**: Ultimate AI Business Assistant
- **Value**: $2,500
- **Duration**: 7 days
- **Winner Selection**: Based on eligibility + entry score + random selection
- **Bonus Feature**: Referral wins (if someone you refer wins, you win too!)

### Key Features
1. Multi-step entry form with qualification questions
2. Points-based qualifying actions system
3. Viral referral mechanism with unique codes
4. Real-time leaderboard
5. Automated email notifications
6. UTM tracking for ad campaign analysis
7. Mobile-responsive design

## File Structure

```
/giveaway.html              - Main entry page with form
/giveaway-confirmation.html - Thank you page with referral link
/giveaway-leaderboard.html  - Public leaderboard showing top entries
/giveaway-styles.css        - Dedicated styling for giveaway pages
/giveaway.js                - Form handling and interaction logic
/supabase/functions/submit-giveaway-entry/ - Edge function for submissions
```

## Database Tables

### giveaway_entries
Stores all giveaway entries with detailed information:
- Contact details (name, email, phone, WhatsApp)
- Business information
- Qualification responses
- Entry score and status
- Referral tracking
- UTM parameters

### giveaway_referrals
Tracks referral relationships for the double-prize mechanism.

## How It Works

### 1. Entry Process

**Step 1: Basic Information**
- Name, email, phone, WhatsApp
- Business details
- Revenue and employee count

**Step 2: Qualification Questions**
- Current business challenges (min 50 chars)
- Why they should win (min 100 chars)
- Business goals (min 30 chars)
- Timeline urgency (min 30 chars)

**Step 3: Qualifying Actions**
- Required: Join WhatsApp channel (+10 pts)
- Required: Email verification (+5 pts)
- Optional: Share on Facebook (+20 pts)
- Optional: Share on LinkedIn (+20 pts)
- Optional: Refer friends (+30 pts each)

### 2. Points System

- WhatsApp Channel Join: 10 points (required)
- Email Verification: 5 points (required)
- Facebook Share: 20 points
- LinkedIn Share: 20 points
- Each Qualified Referral: 30 points

**Qualification Threshold**: Minimum 15 points (join WhatsApp + verify email)

### 3. Referral Mechanism

Each entry generates a unique referral code (format: `AI-GIVEAWAY-[NAME]-[RANDOM]`)

**Referral Link Format:**
```
https://insteltech.co.zw/giveaway.html?ref=AI-GIVEAWAY-JOHN-X8K9
```

**Double-Prize Feature:**
- If person A refers person B
- And person B wins the grand prize
- Then person A ALSO wins the same prize
- Both receive the $2,500 AI Assistant

### 4. Winner Selection

Winners selected based on:
1. Meets eligibility criteria (Zimbabwe business)
2. Completed all required actions (qualified)
3. Higher entry scores = better chances
4. Random selection among qualified entries

## Usage Instructions

### For Running the Giveaway

1. **Update Countdown Timer**
   - Open `giveaway.js`
   - Modify `GIVEAWAY_END_DATE` to your desired end date
   - Current default: 7 days from now

2. **Update WhatsApp Channel Link**
   - In `giveaway.js`, find `joinWhatsApp()` function
   - Replace the WhatsApp channel URL with your actual channel

3. **Test the Form**
   - Navigate to `/giveaway.html`
   - Complete all three steps
   - Verify entry in Supabase dashboard
   - Check email notification received

4. **Share the Giveaway**
   - Facebook Ads: Add UTM parameters
   - Example: `giveaway.html?utm_source=facebook&utm_medium=paid&utm_campaign=ai-giveaway-2025`
   - Organic: Share base URL `giveaway.html`

5. **Monitor Performance**
   - View leaderboard: `/giveaway-leaderboard.html`
   - Check Supabase dashboard for entries
   - Review email notifications

### For Ad Campaigns

**Recommended UTM Structure:**

Facebook Ads:
```
?utm_source=facebook&utm_medium=paid&utm_campaign=ai-giveaway-jan2025
```

Instagram Ads:
```
?utm_source=instagram&utm_medium=paid&utm_campaign=ai-giveaway-jan2025
```

Google Ads:
```
?utm_source=google&utm_medium=cpc&utm_campaign=ai-giveaway-jan2025
```

Organic Social:
```
?utm_source=facebook&utm_medium=organic&utm_campaign=ai-giveaway-jan2025
```

### Post-Giveaway Process

1. **Select Winners** (After deadline)
   - Query qualified entries: `SELECT * FROM giveaway_entries WHERE is_qualified = true ORDER BY entry_score DESC`
   - Use entry_score as weight for random selection
   - Check if winner was referred (check `referred_by_email`)
   - If yes, mark both winner and referrer as winners

2. **Announce Winners**
   - Contact via WhatsApp (primary)
   - Send email notification
   - Post on social media
   - Update winner records: `UPDATE giveaway_entries SET is_winner = true WHERE email = 'winner@email.com'`

3. **Contact Non-Winners**
   - Send promotional offer email (80% discount)
   - Offer: $499 instead of $2,500
   - Deadline: 7 days after announcement
   - Use template from plan document

4. **Nurture Campaign**
   - Add all entries to main leads table
   - Tag as "giveaway_participant"
   - Continue email marketing
   - Offer other services

## Email Notifications

All entries trigger automatic email notifications to: `meloshaya02@gmail.com`

**Email includes:**
- Contact information
- Business details
- Qualification responses
- Entry score and status
- Traffic source (UTM data)
- Referral information

## Customization Options

### Change Prize Details
Edit `giveaway.html`:
- Update prize value amounts
- Modify prize features list
- Change prize description

### Adjust Qualifying Actions
Edit `giveaway.js`:
- Modify point values in `updateScore()` function
- Add/remove qualifying actions
- Change qualification threshold

### Modify Form Fields
Edit `giveaway.html`:
- Add/remove form fields in each step
- Update validation requirements
- Change dropdown options

### Customize Design
Edit `giveaway-styles.css`:
- Color scheme (currently gold/blue/green)
- Typography
- Layout spacing
- Responsive breakpoints

## Security Features

- Row Level Security (RLS) enabled on all tables
- Public INSERT allowed for entries (necessary for form)
- Public SELECT allowed for referral validation
- UPDATE/DELETE restricted to authenticated users
- Email notification on every submission
- IP address tracking for fraud prevention
- Unique email constraint prevents duplicate entries

## Analytics & Reporting

### Key Metrics to Track

1. **Entry Metrics**
   - Total entries
   - Qualified entries (%)
   - Average entry score
   - Form abandonment rate per step

2. **Referral Metrics**
   - Total referrals
   - Referral conversion rate
   - Top referrers
   - Viral coefficient

3. **Traffic Metrics**
   - Entries by UTM source
   - Cost per lead (CPL) by channel
   - Conversion rate by traffic source

4. **Engagement Metrics**
   - WhatsApp channel join rate
   - Social share rate
   - Time to complete form

### SQL Queries for Analysis

**Total Entries by Source:**
```sql
SELECT utm_source, COUNT(*) as entries
FROM giveaway_entries
GROUP BY utm_source
ORDER BY entries DESC;
```

**Top Referrers:**
```sql
SELECT e.name, e.email, COUNT(r.id) as referral_count
FROM giveaway_entries e
LEFT JOIN giveaway_referrals r ON e.email = r.referrer_email
GROUP BY e.id, e.name, e.email
ORDER BY referral_count DESC
LIMIT 10;
```

**Qualification Rate:**
```sql
SELECT
  COUNT(*) as total_entries,
  SUM(CASE WHEN is_qualified THEN 1 ELSE 0 END) as qualified,
  ROUND(100.0 * SUM(CASE WHEN is_qualified THEN 1 ELSE 0 END) / COUNT(*), 2) as qualification_rate
FROM giveaway_entries;
```

**Average Score by Business Type:**
```sql
SELECT business_type, AVG(entry_score) as avg_score, COUNT(*) as entries
FROM giveaway_entries
GROUP BY business_type
ORDER BY avg_score DESC;
```

## Troubleshooting

### Form Not Submitting
- Check browser console for errors
- Verify Supabase edge function is active
- Ensure all required fields are filled
- Check internet connection

### Referral Link Not Working
- Verify referral code format is correct
- Check if referrer email exists in database
- Ensure referral tracking code is executed

### Email Notifications Not Received
- Verify RESEND_API_KEY is configured (done automatically)
- Check spam/junk folder
- Verify email address in edge function

### Leaderboard Not Loading
- Check browser console for errors
- Verify Supabase credentials
- Ensure giveaway_entries table has data
- Check RLS policies allow public SELECT

## Best Practices

1. **Before Launch**
   - Test complete entry flow
   - Verify email notifications work
   - Test referral mechanism
   - Check mobile responsiveness
   - Set up ad tracking parameters

2. **During Campaign**
   - Monitor entries daily
   - Respond to questions quickly
   - Share leaderboard updates
   - Encourage referrals via WhatsApp channel
   - Post reminder content as deadline approaches

3. **After Campaign**
   - Announce winner within 48 hours
   - Send promotional offer immediately
   - Follow up with non-respondents
   - Request testimonials from winner
   - Analyze campaign performance

4. **Data Management**
   - Export entries regularly
   - Back up database
   - Document winner selection process
   - Keep records for compliance

## Legal Compliance

The giveaway includes:
- Official rules modal
- Privacy policy modal
- "No purchase necessary" disclaimer
- Eligibility restrictions (Zimbabwe only, 18+)
- Terms acceptance checkbox
- Marketing opt-in (separate checkbox)

Ensure you:
- Follow local sweepstakes laws
- Honor all stated rules
- Protect participant data
- Deliver prizes as promised

## Support

For technical issues or questions:
- Email: meloshaya02@gmail.com
- Phone: +263 787 938 836

---

**Campaign Goal**: Generate high-quality leads while providing massive value through the giveaway prize, with a viral referral mechanism to maximize reach and engagement.