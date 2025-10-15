const { PrismaClient } = require('./api/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function analyzeTimeoutPatterns() {
  try {
    console.log('\n📊 Analyzing All Recent Workflow Processing Times');
    console.log('='.repeat(80));

    // Get all workflows from last 24 hours with timing data
    const workflows = await prisma.workflowExecution.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      },
      orderBy: { createdAt: 'desc' },
      select: {
        workflowId: true,
        status: true,
        currentStage: true,
        errorMessage: true,
        inputData: true,
        createdAt: true,
        updatedAt: true
      }
    });

    console.log(`\nFound ${workflows.length} workflows in last 24 hours`);

    const aiParsingWorkflows = workflows.filter(w => 
      w.currentStage === 'ai_parsing' || 
      w.status === 'completed' ||
      w.errorMessage?.includes('Vision API') ||
      w.errorMessage?.includes('timeout')
    );

    console.log(`\n🤖 AI Parsing Analysis (${aiParsingWorkflows.length} workflows):`);
    console.log('='.repeat(80));

    let timeouts = 0;
    let successes = 0;
    const timings = [];

    for (const wf of aiParsingWorkflows) {
      const fileSize = wf.inputData?.fileSize || 0;
      const fileSizeKB = (fileSize / 1024).toFixed(1);
      const duration = (wf.updatedAt - wf.createdAt) / 1000; // seconds
      
      const isTimeout = wf.errorMessage?.includes('timeout') || wf.errorMessage?.includes('Vision API');
      const isSuccess = wf.status === 'completed';

      if (isTimeout) timeouts++;
      if (isSuccess) successes++;

      timings.push({
        workflowId: wf.workflowId,
        fileSize: fileSizeKB,
        duration: duration.toFixed(1),
        status: isTimeout ? '⏰ TIMEOUT' : isSuccess ? '✅ SUCCESS' : '⏳ PROCESSING'
      });
    }

    // Sort by duration descending
    timings.sort((a, b) => parseFloat(b.duration) - parseFloat(a.duration));

    console.log('\n📈 Top 10 Longest Processing Times:');
    for (const t of timings.slice(0, 10)) {
      console.log(`  ${t.status} | ${t.fileSize}KB | ${t.duration}s | ${t.workflowId}`);
    }

    console.log('\n📊 Statistics:');
    console.log(`  Total analyzed: ${aiParsingWorkflows.length}`);
    console.log(`  Timeouts: ${timeouts}`);
    console.log(`  Successes: ${successes}`);
    console.log(`  Timeout rate: ${(timeouts / aiParsingWorkflows.length * 100).toFixed(1)}%`);

    if (timings.length > 0) {
      const durations = timings.map(t => parseFloat(t.duration));
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);

      console.log(`\n⏱️ Duration Analysis:`);
      console.log(`  Average: ${avgDuration.toFixed(1)}s`);
      console.log(`  Min: ${minDuration.toFixed(1)}s`);
      console.log(`  Max: ${maxDuration.toFixed(1)}s`);
      console.log(`  Median: ${durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)].toFixed(1)}s`);

      console.log('\n💡 Timeout Recommendation:');
      const p95 = durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)];
      console.log(`  95th percentile: ${p95.toFixed(1)}s`);
      
      if (p95 > 60) {
        console.log(`  ⚠️ CURRENT 60s timeout is too short!`);
        console.log(`  📊 Recommended base timeout: ${Math.ceil(p95 / 10) * 10}s`);
      } else {
        console.log(`  ✅ Current 60s timeout should be adequate`);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeTimeoutPatterns();
