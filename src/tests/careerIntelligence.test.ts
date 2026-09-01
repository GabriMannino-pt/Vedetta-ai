import { initDb, getDb } from '../storage/db';
import { createProfile } from '../career/careerProfile';
import { createOpportunity, getOpportunity } from '../career/careerOpportunities';
import { setMockMode } from '../career/requirementExtractor';
import { analyzeOpportunity, getOpportunityAnalysis } from '../career/opportunityIntelligence';
import { listRequirements } from '../career/requirementRepository';

async function runIntelligenceTests() {
  console.log('\n==================================================');
  console.log('🧪 RUNNING CAREER OS INTELLIGENCE TEST SUITE');
  console.log('==================================================\n');

  initDb();
  const db = getDb();

  // Reset database tables
  db.prepare('DELETE FROM career_opportunity_requirements').run();
  db.prepare('DELETE FROM career_opportunities').run();
  db.prepare('DELETE FROM career_profile').run();

  // 0. Setup Profile
  const profileId = createProfile({
    name: 'Gabriele Mannino',
    headline: 'AI Integration Specialist',
    summary: 'Dev',
    years_experience: 3,
    seniority: 'Mid',
    target_salary_min: 40000,
    target_salary_max: 55000,
    target_hourly_rate: 40,
    remote_preference: 'REMOTE',
    location: 'Italy',
    career_goal: 'Goal'
  });

  // Test 1: Basic Extraction Mocking Gemini
  console.log('Test 1: Basic requirement extraction and mapping...');
  const description = 'We are looking for a Senior AI Engineer with 5+ years of Python experience and strong knowledge of TypeScript, AWS and LLM applications.';
  
  const mockResult = {
    summary: 'Senior AI Engineer position focused on LLM systems.',
    roleFocus: ['AI Engineering', 'LLM orchestration'],
    responsibilities: ['Build LLM systems', 'Maintain AI microservices'],
    requirements: [
      {
        name: 'Python',
        category: 'TECHNICAL',
        priority: 'MUST_HAVE',
        yearsRequired: 5,
        sourceText: '5+ years of Python experience',
        confidence: 0.95
      },
      {
        name: 'TypeScript',
        category: 'TECHNICAL',
        priority: 'SHOULD_HAVE',
        yearsRequired: null,
        sourceText: 'knowledge of TypeScript',
        confidence: 0.90
      },
      {
        name: 'AWS',
        category: 'TECHNICAL',
        priority: 'SHOULD_HAVE',
        yearsRequired: null,
        sourceText: 'knowledge of AWS',
        confidence: 0.88
      },
      {
        name: 'LLM applications',
        category: 'TECHNICAL',
        priority: 'SHOULD_HAVE',
        yearsRequired: null,
        sourceText: 'LLM applications',
        confidence: 0.92
      }
    ],
    technologies: ['Python', 'TypeScript', 'AWS'],
    languages: [],
    senioritySignals: ['Senior AI Engineer'],
    remoteSignals: [],
    riskSignals: [],
    extractionConfidence: 0.95
  };

  setMockMode(true, mockResult);

  const oppId = createOpportunity({
    profile_id: profileId,
    title: 'Senior AI Engineer',
    company_name: 'AI Startup',
    description: description,
    source: 'DIRECT',
    opportunity_type: 'FULL_TIME',
    seniority: 'SENIOR',
    location: 'Rome',
    remote_type: 'REMOTE',
    status: 'NEW'
  });

  // Run analysis
  const analysis = await analyzeOpportunity(oppId);

  if (analysis.requirements.length !== 4) {
    throw new Error(`FAIL: Extracted ${analysis.requirements.length} requirements instead of 4`);
  }
  
  const pythonReq = analysis.requirements.find(r => r.name === 'Python')!;
  if (!pythonReq || pythonReq.priority !== 'MUST_HAVE' || pythonReq.yearsRequired !== 5) {
    throw new Error('FAIL: Python requirement details mismatched');
  }

  const tsReq = analysis.requirements.find(r => r.name === 'TypeScript')!;
  if (!tsReq || tsReq.normalizedName !== 'typescript') {
    throw new Error('FAIL: TS normalization mismatched');
  }

  console.log('  - Basic extraction and mapping verified successfully.');

  // Test 2: Missing salary (not hallucinated)
  console.log('\nTest 2: Verify missing salary remains null...');
  const checkOpp = getOpportunity(oppId)!;
  if (checkOpp.salary_min !== null || checkOpp.salary_max !== null) {
    throw new Error('FAIL: Salary was hallucinated/coerced');
  }
  console.log('  - Missing salary is verified null.');

  // Test 3: Evidence preservation
  console.log('\nTest 3: Evidence preservation check...');
  if (pythonReq.evidence.sourceText !== '5+ years of Python experience' || pythonReq.evidence.sourceType !== 'JOB_DESCRIPTION') {
    throw new Error('FAIL: Evidence source text not preserved');
  }
  console.log('  - Evidence source text preserved successfully.');

  // Test 4: Confidence range validation
  console.log('\nTest 4: Confidence range validation check...');
  
  // Test out-of-range confidence
  const invalidConfidenceMock = {
    ...mockResult,
    extractionConfidence: 1.5 // Invalid
  };
  
  const badConfidenceOppId = createOpportunity({
    profile_id: profileId,
    title: 'Confidence Error Job',
    company_name: 'Test Corp',
    description: 'Description',
    source: 'DIRECT',
    opportunity_type: 'FULL_TIME',
    seniority: 'MID',
    location: 'Milan',
    remote_type: 'REMOTE',
    status: 'NEW'
  });

  try {
    setMockMode(true, invalidConfidenceMock);
    await analyzeOpportunity(badConfidenceOppId);
    throw new Error('FAIL: Allowed out-of-range extraction confidence');
  } catch (e: any) {
    if (!e.message.includes('extractionConfidence must be a number between 0 and 1')) throw e;
  }
  console.log('  - Out-of-range confidence correctly rejected.');

  // Test 5: Duplicate normalization
  console.log('\nTest 5: Duplicate skill name normalization...');
  const duplicateSkillsMock = {
    ...mockResult,
    requirements: [
      {
        name: 'TypeScript',
        category: 'TECHNICAL',
        priority: 'MUST_HAVE',
        sourceText: 'TypeScript experience',
        confidence: 0.95
      },
      {
        name: 'typescript', // Same normal name
        category: 'TECHNICAL',
        priority: 'NICE_TO_HAVE',
        sourceText: 'knowledge of typescript',
        confidence: 0.90
      }
    ]
  };
  
  const duplicateSkillsOppId = createOpportunity({
    profile_id: profileId,
    title: 'Duplicate Skills Job',
    company_name: 'Test Corp',
    description: 'Description',
    source: 'DIRECT',
    opportunity_type: 'FULL_TIME',
    seniority: 'MID',
    location: 'Milan',
    remote_type: 'REMOTE',
    status: 'NEW'
  });

  setMockMode(true, duplicateSkillsMock);
  const dupAnalysis = await analyzeOpportunity(duplicateSkillsOppId);
  // It should filter duplicate requirement based on unique (normalizedName, category)
  if (dupAnalysis.requirements.length !== 1) {
    throw new Error(`FAIL: Duplicate requirements not deduplicated. Length: ${dupAnalysis.requirements.length}`);
  }
  console.log('  - Duplicate skill extraction correctly deduplicated.');

  // Test 6: Required vs Nice-to-have
  console.log('\nTest 6: Required vs Nice-to-have classification...');
  const reqVsNiceMock = {
    ...mockResult,
    requirements: [
      {
        name: 'Python',
        category: 'TECHNICAL',
        priority: 'MUST_HAVE',
        sourceText: 'Required: Python',
        confidence: 0.95
      },
      {
        name: 'Docker',
        category: 'TECHNICAL',
        priority: 'NICE_TO_HAVE',
        sourceText: 'Nice to have: Docker',
        confidence: 0.90
      }
    ]
  };

  const reqVsNiceOppId = createOpportunity({
    profile_id: profileId,
    title: 'Req Vs Nice Job',
    company_name: 'Test Corp',
    description: 'Description',
    source: 'DIRECT',
    opportunity_type: 'FULL_TIME',
    seniority: 'MID',
    location: 'Milan',
    remote_type: 'REMOTE',
    status: 'NEW'
  });

  setMockMode(true, reqVsNiceMock);
  const reqVsNiceAnalysis = await analyzeOpportunity(reqVsNiceOppId);
  const mustReq = reqVsNiceAnalysis.requirements.find(r => r.name === 'Python')!;
  const niceReq = reqVsNiceAnalysis.requirements.find(r => r.name === 'Docker')!;
  if (mustReq.priority !== 'MUST_HAVE' || niceReq.priority !== 'NICE_TO_HAVE') {
    throw new Error('FAIL: Priority classification mismatched');
  }
  console.log('  - Must-have vs Nice-to-have prioritized correctly.');

  // Test 7: No Hallucination
  console.log('\nTest 7: No hallucinated requirements check...');
  const emptyJobMock = {
    summary: 'We are looking for a developer.',
    roleFocus: [],
    responsibilities: [],
    requirements: [],
    technologies: [],
    languages: [],
    senioritySignals: [],
    remoteSignals: [],
    riskSignals: [],
    extractionConfidence: 0.90
  };

  const emptyJobOppId = createOpportunity({
    profile_id: profileId,
    title: 'Developer',
    company_name: 'Generic Co',
    description: 'We are looking for a developer.',
    source: 'DIRECT',
    opportunity_type: 'FULL_TIME',
    seniority: 'MID',
    location: 'Milan',
    remote_type: 'REMOTE',
    status: 'NEW'
  });

  setMockMode(true, emptyJobMock);
  const emptyAnalysis = await analyzeOpportunity(emptyJobOppId);
  if (emptyAnalysis.requirements.length > 0 || emptyAnalysis.technologies.length > 0) {
    throw new Error('FAIL: Hallucinated requirements on empty job description');
  }
  console.log('  - No hallucinated requirements verified successfully.');

  // Test 8: Transaction Rollback
  console.log('\nTest 8: Transaction rollback on DB insertion error...');
  const errorMock = {
    ...mockResult,
    requirements: [
      {
        name: '', // Empty name will cause database or validation failure in addRequirement
        category: 'TECHNICAL',
        priority: 'MUST_HAVE',
        sourceText: 'Invalid Requirement',
        confidence: 0.95
      }
    ]
  };

  const errorJobOppId = createOpportunity({
    profile_id: profileId,
    title: 'Rollback Job',
    company_name: 'Rollback LLC',
    description: 'We want rollback test.',
    source: 'DIRECT',
    opportunity_type: 'FULL_TIME',
    seniority: 'MID',
    location: 'Rome',
    remote_type: 'REMOTE',
    status: 'NEW'
  });

  setMockMode(true, errorMock);
  try {
    await analyzeOpportunity(errorJobOppId);
    throw new Error('FAIL: Allowed insertion of invalid requirement name');
  } catch (e: any) {
    // Assert status updated to FAILED and requirements table remains empty for this job
    const reqsCount = db.prepare('SELECT COUNT(*) as cnt FROM career_opportunity_requirements WHERE opportunity_id = ?')
      .get(errorJobOppId) as { cnt: number };
    const errOpp = getOpportunity(errorJobOppId)!;
    
    if (reqsCount.cnt !== 0) {
      throw new Error("FAIL: Requirements were partially saved");
    }
    if (errOpp.analysis_status !== 'FAILED') {
      throw new Error("FAIL: Status not marked as FAILED");
    }
  }
  console.log('  - Transaction rollback on error works perfectly.');

  // Test 9: Re-analysis (Replace previous requirements)
  console.log('\nTest 9: Re-analysis and overwrite logic...');
  
  // Set valid mock for original analysis
  setMockMode(true, mockResult);
  await analyzeOpportunity(oppId);
  const originalCount = listRequirements(oppId).length;

  // New mock with 2 requirements
  const reAnalyzeMock = {
    ...mockResult,
    requirements: [
      {
        name: 'Node.js',
        category: 'TECHNICAL',
        priority: 'MUST_HAVE',
        sourceText: 'Node.js experience',
        confidence: 0.99
      },
      {
        name: 'Docker',
        category: 'TECHNICAL',
        priority: 'NICE_TO_HAVE',
        sourceText: 'Docker experience',
        confidence: 0.85
      }
    ]
  };

  setMockMode(true, reAnalyzeMock);
  const reAnalysis = await analyzeOpportunity(oppId);
  const freshCount = listRequirements(oppId).length;
  
  if (freshCount !== 2) {
    throw new Error(`FAIL: Expected 2 requirements, got ${freshCount}`);
  }
  console.log('  - Re-analysis overwrite logic verified successfully.');

  // Test 10: Full Pipeline Integration
  console.log('\nTest 10: Full E2E Requirement Extraction Pipeline...');
  const finalAnalysis = getOpportunityAnalysis(oppId);
  if (!finalAnalysis || finalAnalysis.requirements.length !== 2 || finalAnalysis.summary !== 'Senior AI Engineer position focused on LLM systems.') {
    throw new Error('FAIL: Full pipeline analysis retrieve error');
  }
  console.log('  - Full pipeline integration verified successfully.');

  console.log('\n==================================================');
  console.log('✅ ALL OPPORTUNITY INTELLIGENCE TESTS PASSED!');
  console.log('==================================================\n');
}

runIntelligenceTests().then(() => {
  process.exit(0);
}).catch(e => {
  console.error('\n❌ TEST SUITE FAILED:', e.message);
  console.error(e.stack);
  process.exit(1);
});
