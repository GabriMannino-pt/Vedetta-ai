import { getDb } from '../storage/db';

export function getRealizedRevenueForApplication(applicationId: number): number {
  const db = getDb();
  
  // Check if there are explicit cash payments linked to this career application
  // or via opportunity link in revenue truth table
  const app = db.prepare('SELECT opportunity_id FROM career_applications WHERE id = ?').get(applicationId) as any;
  if (!app) return 0;

  // 1. Check revenue_payments table for any payments tagged or matched to opportunity title/id
  try {
    const opp = db.prepare('SELECT title, company_name FROM career_opportunities WHERE id = ?').get(app.opportunity_id) as any;
    if (opp) {
      const paymentRow = db.prepare(`
        SELECT SUM(amount) as total_cash FROM revenue_payments 
        WHERE client_email LIKE ? OR notes LIKE ? OR product LIKE ?
      `).get(
        `%${opp.company_name}%`,
        `%opp_${app.opportunity_id}%`,
        `%${opp.title}%`
      ) as any;

      if (paymentRow && paymentRow.total_cash) {
        return Number(paymentRow.total_cash);
      }
    }
  } catch (e) {
    // If revenue tables are not populated yet, default to 0 safely
  }

  // 2. Check metadata in outcome events for explicitly confirmed cash amounts
  const wonEvent = db.prepare(`
    SELECT metadata_json FROM career_outcome_events 
    WHERE application_id = ? AND event_type = 'WON' 
    ORDER BY id DESC LIMIT 1
  `).get(applicationId) as any;

  if (wonEvent && wonEvent.metadata_json) {
    try {
      const parsed = JSON.parse(wonEvent.metadata_json);
      if (typeof parsed.realized_revenue === 'number') {
        return parsed.realized_revenue;
      }
      if (typeof parsed.revenue === 'number') {
        return parsed.revenue;
      }
    } catch (err) {}
  }

  return 0;
}
