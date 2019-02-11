import { currentURL } from 'ember-native-dom-helpers';
import { test } from 'qunit';
import moduleForAcceptance from 'nomad-ui/tests/helpers/module-for-acceptance';
import JobsList from 'nomad-ui/tests/pages/jobs/list';

moduleForAcceptance('Acceptance | jobs list', {
  beforeEach() {
    // Required for placing allocations (a result of creating jobs)
    server.create('node');
  },
});

test('visiting /jobs', function(assert) {
  JobsList.visit();

  andThen(() => {
    assert.equal(currentURL(), '/jobs');
  });
});

test('/jobs should list the first page of jobs sorted by modify index', function(assert) {
  const jobsCount = JobsList.pageSize + 1;
  server.createList('job', jobsCount, { createAllocations: false });

  JobsList.visit();

  andThen(() => {
    const sortedJobs = server.db.jobs.sortBy('modifyIndex').reverse();
    assert.equal(JobsList.jobs.length, JobsList.pageSize);
    JobsList.jobs.forEach((job, index) => {
      assert.equal(job.name, sortedJobs[index].name, 'Jobs are ordered');
    });
  });
});

test('each job row should contain information about the job', function(assert) {
  server.createList('job', 2);
  const job = server.db.jobs.sortBy('modifyIndex').reverse()[0];
  const taskGroups = server.db.taskGroups.where({ jobId: job.id });

  JobsList.visit();

  andThen(() => {
    const jobRow = JobsList.jobs.objectAt(0);

    assert.equal(jobRow.name, job.name, 'Name');
    assert.equal(jobRow.link, `/ui/jobs/${job.id}`, 'Detail Link');
    assert.equal(jobRow.status, job.status, 'Status');
    assert.equal(jobRow.type, typeForJob(job), 'Type');
    assert.equal(jobRow.priority, job.priority, 'Priority');
    andThen(() => {
      assert.equal(jobRow.taskGroups, taskGroups.length, '# Groups');
    });
  });
});

test('each job row should link to the corresponding job', function(assert) {
  server.create('job');
  const job = server.db.jobs[0];

  JobsList.visit();

  andThen(() => {
    JobsList.jobs.objectAt(0).clickName();
  });

  andThen(() => {
    assert.equal(currentURL(), `/jobs/${job.id}`);
  });
});

test('the new job button transitions to the new job page', function(assert) {
  JobsList.visit();

  andThen(() => {
    JobsList.runJob();
  });

  andThen(() => {
    assert.equal(currentURL(), '/jobs/run');
  });
});

test('when there are no jobs, there is an empty message', function(assert) {
  JobsList.visit();

  andThen(() => {
    assert.ok(JobsList.isEmpty, 'There is an empty message');
    assert.equal(JobsList.emptyState.headline, 'No Jobs', 'The message is appropriate');
  });
});

test('when there are jobs, but no matches for a search result, there is an empty message', function(assert) {
  server.create('job', { name: 'cat 1' });
  server.create('job', { name: 'cat 2' });

  JobsList.visit();

  andThen(() => {
    JobsList.search('dog');
  });

  andThen(() => {
    assert.ok(JobsList.isEmpty, 'The empty message is shown');
    assert.equal(JobsList.emptyState.headline, 'No Matches', 'The message is appropriate');
  });
});

test('searching resets the current page', function(assert) {
  server.createList('job', JobsList.pageSize + 1, { createAllocations: false });
  JobsList.visit();

  andThen(() => {
    JobsList.nextPage();
  });

  andThen(() => {
    assert.equal(currentURL(), '/jobs?page=2', 'Page query param captures page=2');
    JobsList.search('foobar');
  });

  andThen(() => {
    assert.equal(currentURL(), '/jobs?search=foobar', 'No page query param');
  });
});

test('when the namespace query param is set, only matching jobs are shown and the namespace value is forwarded to app state', function(assert) {
  server.createList('namespace', 2);
  const job1 = server.create('job', { namespaceId: server.db.namespaces[0].id });
  const job2 = server.create('job', { namespaceId: server.db.namespaces[1].id });

  JobsList.visit();

  andThen(() => {
    assert.equal(JobsList.jobs.length, 1, 'One job in the default namespace');
    assert.equal(JobsList.jobs.objectAt(0).name, job1.name, 'The correct job is shown');
  });

  const secondNamespace = server.db.namespaces[1];
  JobsList.visit({ namespace: secondNamespace.id });

  andThen(() => {
    assert.equal(JobsList.jobs.length, 1, `One job in the ${secondNamespace.name} namespace`);
    assert.equal(JobsList.jobs.objectAt(0).name, job2.name, 'The correct job is shown');
  });
});

test('when accessing jobs is forbidden, show a message with a link to the tokens page', function(assert) {
  server.pretender.get('/v1/jobs', () => [403, {}, null]);

  JobsList.visit();

  andThen(() => {
    assert.equal(JobsList.error.title, 'Not Authorized');
  });

  andThen(() => {
    JobsList.error.seekHelp();
  });

  andThen(() => {
    assert.equal(currentURL(), '/settings/tokens');
  });
});

function typeForJob(job) {
  return job.periodic ? 'periodic' : job.parameterized ? 'parameterized' : job.type;
}

test('the jobs list page has appropriate faceted search options', function(assert) {
  JobsList.visit();

  andThen(() => {
    assert.ok(JobsList.facets.type.isPresent, 'Type facet found');
    assert.ok(JobsList.facets.status.isPresent, 'Status facet found');
    assert.ok(JobsList.facets.datacenter.isPresent, 'Datacenter facet found');
    assert.ok(JobsList.facets.prefix.isPresent, 'Prefix facet found');
  });
});

testFacet('Type', {
  facet: JobsList.facets.type,
  paramName: 'type',
  expectedOptions: ['Batch', 'Parameterized', 'Periodic', 'Service', 'System'],
  beforeEach() {
    server.createList('job', 2, { createAllocations: false, type: 'batch' });
    server.createList('job', 2, {
      createAllocations: false,
      type: 'batch',
      periodic: true,
      childrenCount: 0,
    });
    server.createList('job', 2, {
      createAllocations: false,
      type: 'batch',
      parameterized: true,
      childrenCount: 0,
    });
    server.createList('job', 2, { createAllocations: false, type: 'service' });
    JobsList.visit();
  },
  filter(job, selection) {
    let displayType = job.type;
    if (job.parameterized) displayType = 'parameterized';
    if (job.periodic) displayType = 'periodic';
    return selection.includes(displayType);
  },
});

testFacet('Status', {
  facet: JobsList.facets.status,
  paramName: 'status',
  expectedOptions: ['Pending', 'Running', 'Dead'],
  beforeEach() {
    server.createList('job', 2, { status: 'pending', createAllocations: false, childrenCount: 0 });
    server.createList('job', 2, { status: 'running', createAllocations: false, childrenCount: 0 });
    server.createList('job', 2, { status: 'dead', createAllocations: false, childrenCount: 0 });
    JobsList.visit();
  },
  filter: (job, selection) => selection.includes(job.status),
});

testFacet('Datacenter', {
  facet: JobsList.facets.datacenter,
  paramName: 'dc',
  expectedOptions(jobs) {
    const allDatacenters = new Set(
      jobs.mapBy('datacenters').reduce((acc, val) => acc.concat(val), [])
    );
    return Array.from(allDatacenters).sort();
  },
  beforeEach() {
    server.create('job', {
      datacenters: ['pdx', 'lax'],
      createAllocations: false,
      childrenCount: 0,
    });
    server.create('job', {
      datacenters: ['pdx', 'ord'],
      createAllocations: false,
      childrenCount: 0,
    });
    server.create('job', {
      datacenters: ['lax', 'jfk'],
      createAllocations: false,
      childrenCount: 0,
    });
    server.create('job', {
      datacenters: ['jfk', 'dfw'],
      createAllocations: false,
      childrenCount: 0,
    });
    server.create('job', { datacenters: ['pdx'], createAllocations: false, childrenCount: 0 });
    JobsList.visit();
  },
  filter: (job, selection) => job.datacenters.find(dc => selection.includes(dc)),
});

testFacet('Prefix', {
  facet: JobsList.facets.prefix,
  paramName: 'prefix',
  expectedOptions: ['hashi (3)', 'nmd (2)', 'pre (2)'],
  beforeEach() {
    [
      'pre-one',
      'hashi-one',
      'nmd-one',
      'one-alone',
      'pre-two',
      'hashi-two',
      'hashi-three',
      'nmd-two',
      'noprefix',
    ].forEach(name => {
      server.create('job', { name, createAllocations: false, childrenCount: 0 });
    });
    JobsList.visit();
  },
  filter: (job, selection) => selection.find(prefix => job.name.startsWith(prefix)),
});

test('when the facet selections result in no matches, the empty state states why', function(assert) {
  server.createList('job', 2, { status: 'pending', createAllocations: false, childrenCount: 0 });

  JobsList.visit();

  andThen(() => {
    JobsList.facets.status.toggle();
  });

  andThen(() => {
    JobsList.facets.status.options.objectAt(1).toggle();
  });

  andThen(() => {
    assert.ok(JobsList.isEmpty, 'There is an empty message');
    assert.equal(JobsList.emptyState.headline, 'No Matches', 'The message is appropriate');
  });
});

test('the jobs list is immediately filtered based on query params', function(assert) {
  server.create('job', { type: 'batch', createAllocations: false });
  server.create('job', { type: 'service', createAllocations: false });

  JobsList.visit({ type: JSON.stringify(['batch']) });

  andThen(() => {
    assert.equal(JobsList.jobs.length, 1, 'Only one job shown due to query param');
  });
});

function testFacet(label, { facet, paramName, beforeEach, filter, expectedOptions }) {
  test(`the ${label} facet has the correct options`, function(assert) {
    beforeEach();

    andThen(() => {
      facet.toggle();
    });

    andThen(() => {
      let expectation;
      if (typeof expectedOptions === 'function') {
        expectation = expectedOptions(server.db.jobs);
      } else {
        expectation = expectedOptions;
      }

      assert.deepEqual(
        facet.options.map(option => option.label.trim()),
        expectation,
        'Options for facet are as expected'
      );
    });
  });

  test(`the ${label} facet filters the jobs list by ${label}`, function(assert) {
    let option;

    beforeEach();

    andThen(() => {
      facet.toggle();
    });

    andThen(() => {
      option = facet.options.objectAt(0);
      option.toggle();
    });

    andThen(() => {
      const selection = [option.key];
      const expectedJobs = server.db.jobs
        .filter(job => filter(job, selection))
        .sortBy('modifyIndex')
        .reverse();

      JobsList.jobs.forEach((job, index) => {
        assert.equal(
          job.id,
          expectedJobs[index].id,
          `Job at ${index} is ${expectedJobs[index].id}`
        );
      });
    });
  });

  test(`selecting multiple options in the ${label} facet results in a broader search`, function(assert) {
    const selection = [];

    beforeEach();

    andThen(() => {
      facet.toggle();
    });

    andThen(() => {
      const option1 = facet.options.objectAt(0);
      const option2 = facet.options.objectAt(1);
      option1.toggle();
      selection.push(option1.key);
      option2.toggle();
      selection.push(option2.key);
    });

    andThen(() => {
      const expectedJobs = server.db.jobs
        .filter(job => filter(job, selection))
        .sortBy('modifyIndex')
        .reverse();

      JobsList.jobs.forEach((job, index) => {
        assert.equal(
          job.id,
          expectedJobs[index].id,
          `Job at ${index} is ${expectedJobs[index].id}`
        );
      });
    });
  });

  test(`selecting options in the ${label} facet updates the ${paramName} query param`, function(assert) {
    const selection = [];

    beforeEach();

    andThen(() => {
      facet.toggle();
    });

    andThen(() => {
      const option1 = facet.options.objectAt(0);
      const option2 = facet.options.objectAt(1);
      option1.toggle();
      selection.push(option1.key);
      option2.toggle();
      selection.push(option2.key);
    });

    andThen(() => {
      assert.equal(
        currentURL(),
        `/jobs?${paramName}=${encodeURIComponent(JSON.stringify(selection))}`,
        'URL has the correct query param key and value'
      );
    });
  });
}
