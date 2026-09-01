import { initDb, getDb } from '../storage/db';
import { createProfile } from '../career/careerProfile';
import { createOpportunity, getOpportunity, updateOpportunity, findByExternalId, findByFingerprint, updateStatus, listOpportunities } from '../career/careerOpportunities';
import { normalizeOpportunity } from '../career/opportunityNormalizer';

function runOpportunityTests() {
  console.log('\n==================================================');
  console.log('🧪 RUNNING CAREER OS OPPORTUNITY TEST SUITE');
  console.log('==================================================\n');

  initDb();
  const db = getDb();

  // Reset database tables to ensure isolation
  db.prepare('DELETE FROM career_opportunities').run();
  db.prepare('DELETE FROM career_profile').run();

  // Create mock profile
  const profileId = createProfile({
    name: 'Gabriele Mannino',
    headline: 'AI Integration Specialist',
    summary: 'Expert developer',
    years_experience: 3,
    seniority: 'Mid',
    target_salary_min: 40000,
    target_salary_max: 50000,
    target_hourly_rate: 40,
    remote_preference: 'REMOTE',
    location: 'Italy',
    career_goal: 'Goal'
  });

  // Test 1: Create Valid Opportunity
  console.log('Test 1: Create Valid Opportunity...');
  const oppId = createOpportunity({
    profile_id: profileId,
    external_id: 'upwork-123',
    source: 'UPWORK',
    source_url: 'https://upwork.com/jobs/123',
    title: 'n8n Workflow Integration specialist',
    company_name: 'Nexus Automation',
    description: 'Looking for a dev',
    opportunity_type: 'FREELANCE',
    seniority: 'SENIOR',
    location: 'Remote US',
    remote_type: 'REMOTE',
    currency: 'USD',
    hourly_rate_min: 35,
    hourly_rate_max: 55,
    status: 'NEW'
  });
  console.log(`  - Opportunity created successfully. ID: ${oppId}`);

  // Test 2: Retrieve & Verify Fields
  console.log('\nTest 2: Retrieve & Verify Fields...');
  const retrieved = getOpportunity(oppId);
  if (!retrieved || retrieved.title !== 'n8n Workflow Integration specialist' || retrieved.hourly_rate_max !== 55) {
    throw new Error('FAIL: Retrieve failed or values mismatched');
  }
  console.log('  - Opportunity retrieved and validated successfully.');

  // Test 3: Update Opportunity
  console.log('\nTest 3: Update Opportunity...');
  retrieved.title = 'n8n & Make Workflow Specialist';
  updateOpportunity(retrieved);
  const updated = getOpportunity(oppId);
  if (!updated || updated.title !== 'n8n & Make Workflow Specialist') {
    throw new Error('FAIL: Update failed');
  }
  console.log('  - Opportunity updated successfully.');

  // Test 4: Validation Constraints
  console.log('\nTest 4: Validation Constraints...');
  
  // Empty title
  try {
    createOpportunity({
      profile_id: profileId,
      source: 'DIRECT',
      title: '',
      company_name: 'Test'
    });
    throw new Error('FAIL: Allowed empty title');
  } catch (e: any) {
    if (e.message !== 'Title cannot be empty') throw e;
  }
  
  // Negative salary
  try {
    createOpportunity({
      profile_id: profileId,
      source: 'DIRECT',
      title: 'Valid title',
      company_name: 'Test',
      salary_min: -100
    });
    throw new Error('FAIL: Allowed negative salary');
  } catch (e: any) {
    if (e.message !== 'Salary min cannot be negative') throw e;
  }

  // Salary max < min
  try {
    createOpportunity({
      profile_id: profileId,
      source: 'DIRECT',
      title: 'Valid title',
      company_name: 'Test',
      salary_min: 50000,
      salary_max: 40000
    });
    throw new Error('FAIL: Allowed salary_max < salary_min');
  } catch (e: any) {
    if (e.message !== 'Salary max cannot be less than salary min') throw e;
  }
  console.log('  - All negative/empty validation tests passed.');

  // Test 5: Nullability (Not converted to 0)
  console.log('\nTest 5: Nullability verification...');
  const nullSalaryId = createOpportunity({
    profile_id: profileId,
    source: 'LINKEDIN',
    title: 'Job without pay declared',
    company_name: 'Airtable agency',
    description: 'Description',
    opportunity_type: 'FULL_TIME',
    seniority: 'MID',
    location: 'Milano',
    remote_type: 'HYBRID',
    status: 'NEW'
  });
  const nullSalaryOpp = getOpportunity(nullSalaryId);
  if (!nullSalaryOpp || nullSalaryOpp.salary_min !== null || nullSalaryOpp.salary_max !== null || nullSalaryOpp.hourly_rate_min !== null) {
    throw new Error('FAIL: Null compensations were coerced or missing');
  }
  console.log('  - Nullability check passed successfully (no zero-coercion).');

  // Test 6: Deduplication (External ID updates last_seen_at)
  console.log('\nTest 6: Deduplication (External ID)...');
  const duplicateId = createOpportunity({
    profile_id: profileId,
    external_id: 'upwork-123',
    source: 'UPWORK',
    source_url: 'https://upwork.com/jobs/123',
    title: 'n8n Workflow Integration specialist',
    company_name: 'Nexus Automation',
    description: 'Looking for a dev',
    opportunity_type: 'FREELANCE',
    seniority: 'SENIOR',
    location: 'Remote US',
    remote_type: 'REMOTE',
    currency: 'USD',
    hourly_rate_min: 35,
    hourly_rate_max: 55,
    status: 'NEW'
  });
  if (duplicateId !== oppId) {
    throw new Error(`FAIL: External ID duplicate created new ID ${duplicateId} instead of updating ${oppId}`);
  }
  console.log('  - External ID duplicate handled successfully (returned same ID).');

  // Test 7: Fingerprint Deduplication
  console.log('\nTest 7: Fingerprint generation & duplicate check...');
  const firstFingerprintOppId = createOpportunity({
    profile_id: profileId,
    source: 'LINKEDIN',
    source_url: 'https://linkedin.com/jobs/999',
    title: 'Direct Hire node dev',
    company_name: 'Nexus Tech',
    description: 'Description',
    opportunity_type: 'FULL_TIME',
    seniority: 'SENIOR',
    location: 'Milan',
    remote_type: 'ONSITE',
    status: 'NEW'
  });
  const firstOpp = getOpportunity(firstFingerprintOppId)!;
  
  // Re-insert exact same details (no external ID)
  const secondFingerprintOppId = createOpportunity({
    profile_id: profileId,
    source: 'LINKEDIN',
    source_url: 'https://linkedin.com/jobs/999',
    title: 'Direct Hire node dev',
    company_name: 'Nexus Tech',
    description: 'Description',
    opportunity_type: 'FULL_TIME',
    seniority: 'SENIOR',
    location: 'Milan',
    remote_type: 'ONSITE',
    status: 'NEW'
  });
  
  if (secondFingerprintOppId !== firstFingerprintOppId) {
    throw new Error('FAIL: Fingerprint duplicates created new row');
  }
  console.log('  - Fingerprint generation and duplicate match passed.');

  // Test 8: Different Source Differentiation
  console.log('\nTest 8: Different Source Differentiation...');
  const upworkSameOppId = createOpportunity({
    profile_id: profileId,
    source: 'UPWORK', // Different source
    source_url: 'https://upwork.com/jobs/999',
    title: 'Direct Hire node dev',
    company_name: 'Nexus Tech',
    description: 'Description',
    opportunity_type: 'FULL_TIME',
    seniority: 'SENIOR',
    location: 'Milan',
    remote_type: 'ONSITE',
    status: 'NEW'
  });
  if (upworkSameOppId === firstFingerprintOppId) {
    throw new Error('FAIL: Collided different sources into same fingerprint');
  }
  console.log('  - Different sources correctly differentiated (no collision).');

  // Test 9: Profile Relation
  console.log('\nTest 9: Career Profile Relation check...');
  try {
    createOpportunity({
      profile_id: 9999, // Non-existent profile
      source: 'LINKEDIN',
      title: 'Orphan Job',
      company_name: 'No profile LLC',
      description: 'Desc',
      opportunity_type: 'CONTRACT',
      seniority: 'MID',
      location: 'Rome',
      remote_type: 'REMOTE'
    });
    throw new Error('FAIL: Allowed insert with invalid profile_id');
  } catch (e: any) {
    if (!e.message.includes('does not exist')) throw e;
  }
  console.log('  - Profile relation foreign key check passed.');

  // Test 10: Status Lifecycle Transitions
  console.log('\nTest 10: Status Lifecycle Transitions...');
  updateStatus(oppId, 'REVIEW');
  let currentOpp = getOpportunity(oppId)!;
  if (currentOpp.status !== 'REVIEW') throw new Error('FAIL: Status not updated to REVIEW');

  updateStatus(oppId, 'SHORTLISTED');
  currentOpp = getOpportunity(oppId)!;
  if (currentOpp.status !== 'SHORTLISTED') throw new Error('FAIL: Status not updated to SHORTLISTED');

  updateStatus(oppId, 'APPLIED');
  currentOpp = getOpportunity(oppId)!;
  if (currentOpp.status !== 'APPLIED' || !currentOpp.applied_at) {
    throw new Error('FAIL: Applied status or timestamp not set');
  }
  console.log('  - Status lifecycle updates verified successfully.');

  console.log('\n==================================================');
  console.log('✅ ALL OPPORTUNITY CORE TESTS PASSED!');
  console.log('==================================================\n');
}

try {
  runOpportunityTests();
  process.exit(0);
} catch (e: any) {
  console.error('\n❌ TEST SUITE FAILED:', e.message);
  console.error(e.stack);
  process.exit(1);
}
