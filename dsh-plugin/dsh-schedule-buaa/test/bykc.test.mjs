import assert from 'node:assert/strict'
import test from 'node:test'
import { parseChosenCourses, pickSemester, fetchChosenCourses } from '../host/bykc.js'
import { runSync } from '../host/sync.js'

// Fixture shapes follow UBAA's LocalBykcApiBackendTest (BUAASubnet/UBAA, MIT).
// Encrypted RESPONSE bodies cannot be produced here (the AES key is RSA-wrapped
// in `ak`, only the school can unwrap it), so the fake upstream answers with
// plain JSON — the same path UBAA's own mock exercises, and the client's
// documented fallback (`decryptResponse` falls back to the raw body).
const semesters = [
  { id: 1, semesterName: '2025-2026-1', semesterStartDate: '2025-09-01 00:00:00', semesterEndDate: '2026-01-31 23:59:59' },
  { id: 2, semesterName: '2025-2026-2', semesterStartDate: '2026-02-23 00:00:00', semesterEndDate: '2026-07-12 23:59:59' },
]
const chosenCourse = (extra = {}) => ({
  id: 9001,
  selectDate: '2026-04-19 10:00:00',
  checkin: 5,
  pass: 0,
  score: 100,
  courseInfo: {
    id: 9527,
    courseName: '耕趣农场劳动课',
    coursePosition: '沙河校区农场',
    courseTeacher: '李老师',
    courseStartDate: '2026-04-20 09:00:00',
    courseEndDate: '2026-04-20 11:00:00',
    courseMaxCount: 100,
    courseCurrentCount: 60,
    courseNewKind1: { id: 1, kindName: '博雅课程' },
    courseNewKind2: { id: 2, kindName: '劳动教育' },
    courseSignType: 2,
    courseSignConfig: '{"signStartDate":"2026-04-20 08:50:00"}',
    ...extra,
  },
})

test('pickSemester selects the window containing today, else the latest end', () => {
  const current = pickSemester(semesters, '2026-04-19T12:00:00')
  assert.equal(current.name, '2025-2026-2')
  // The query must echo the RAW upstream strings, not the normalized form.
  assert.equal(current.startDate, '2026-02-23 00:00:00')
  assert.equal(current.endDate, '2026-07-12 23:59:59')
  // Term break: no window contains the date, fall back to the latest ending.
  assert.equal(pickSemester(semesters, '2026-08-01T00:00:00').name, '2025-2026-2')
  assert.equal(pickSemester([], '2026-08-01T00:00:00'), null)
  assert.equal(pickSemester([
    { semesterName: 'bad', semesterStartDate: 'nope', semesterEndDate: '2026-07-12 23:59:59' },
  ], '2026-08-01T00:00:00'), null)
})

test('chosen courses become locked China-time entries with kind and teacher', () => {
  const parsed = parseChosenCourses([chosenCourse()])
  assert.equal(parsed.skipped, 0)
  assert.deepEqual(parsed.entries, [{
    sourceKey: 'bykc:9527',
    title: '耕趣农场劳动课',
    description: '劳动教育 · 主讲：李老师',
    location: '沙河校区农场',
    start: '2026-04-20T09:00:00+08:00',
    end: '2026-04-20T11:00:00+08:00',
    category: 'course',
    lock: true,
    allDay: false,
  }])
})

test('records without a usable name or time window are skipped, never invented', () => {
  const parsed = parseChosenCourses([
    chosenCourse(),
    chosenCourse({ courseStartDate: '', courseEndDate: '2026-04-20 11:00:00' }),
    chosenCourse({ courseStartDate: '2026-04-20 12:00:00', courseEndDate: '2026-04-20 11:00:00' }),
    chosenCourse({ courseName: '   ' }),
    { id: 7, courseInfo: null },
    'junk',
  ])
  assert.equal(parsed.entries.length, 1)
  // The bare string is not a record at all (ignored); the four real records
  // with unusable names/times are what "skipped" counts.
  assert.equal(parsed.skipped, 4)
  // Kind falls back to the top-level category; missing teacher stays silent.
  const sparse = parseChosenCourses([chosenCourse({
    courseTeacher: '', courseNewKind2: null, coursePosition: ' ',
  })]).entries[0]
  assert.equal(sparse.description, '博雅课程')
  assert.equal(sparse.location, null)
})

test('fetchChosenCourses takes the redirect token and reads both endpoints', async () => {
  const seen = []
  const jsonResponse = value => ({
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(value),
  })
  const redirects = location => ({
    status: 302,
    headers: { get: name => name === 'location' ? location : null },
    text: async () => '',
  })
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url)
    seen.push(`${options.method ?? 'GET'} ${target}`)
    if (target === 'https://bykc.buaa.edu.cn/sscv/cas/login') {
      return redirects('https://bykc.buaa.edu.cn/cas-login?token=tok')
    }
    if (target.endsWith('/sscv/getAllConfig')) return jsonResponse({ status: '0', errmsg: '', data: { semester: semesters } })
    if (target.endsWith('/sscv/queryChosenCourse')) {
      return jsonResponse({ status: '0', errmsg: '', data: { courseList: [chosenCourse()] } })
    }
    throw new Error(`unexpected request ${target}`)
  }
  try {
    const feed = await fetchChosenCourses({
      jar: { header: () => '', store() {} },
      username: '23370001',
      password: 'test-only',
    })
    assert.equal(feed.term, '2025-2026-2')
    assert.equal(feed.courses.length, 1)
    assert.deepEqual(seen.map(row => row.split(' ')[0]), ['GET', 'POST', 'POST'])
    assert.equal(seen.some(row => row.includes('queryChosenCourse')), true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('an error envelope surfaces as a data error, not a fake empty list', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async url => {
    const target = String(url)
    if (target === 'https://bykc.buaa.edu.cn/sscv/cas/login') {
      return {
        status: 302,
        headers: { get: name => name === 'location' ? 'https://bykc.buaa.edu.cn/cas-login?token=tok' : null },
        text: async () => '',
      }
    }
    if (target.endsWith('/ssvc/getAllConfig') || target.endsWith('/sscv/getAllConfig')) {
      return {
        status: 200, headers: { get: () => null },
        text: async () => JSON.stringify({ status: '500', errmsg: '系统维护中', data: null }),
      }
    }
    throw new Error(`unexpected request ${target}`)
  }
  try {
    await assert.rejects(
      fetchChosenCourses({ jar: { header: () => '', store() {} }, username: 'u', password: 'p' }),
      /系统维护中/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('runSync imports bykc into its own source and never lets it fail the JW import', async () => {
  const harness = syncHarness({
    bykc: { fetchChosenCourses: async () => ({ term: '2025-2026-2', courses: [chosenCourse()] }) },
  })
  const summary = await harness.sync()
  assert.equal(summary.entries.total, 1)
  assert.equal(summary.bykc.total, 1)
  assert.equal(summary.bykc.term, '2025-2026-2')
  const bykcCall = harness.calls.find(call => call.source === 'buaa-bykc')
  assert.ok(bykcCall, 'bykc snapshot goes to its own source id')
  assert.equal(bykcCall.inputs[0].sourceKey, 'bykc:9527')
  assert.equal(harness.states.buaa.bykcTerm, '2025-2026-2')
  assert.equal(harness.states.buaa.bykcError, '')

  // Failure: the JW import still succeeds, the error is recorded, and the
  // entries already on the calendar are preserved.
  harness.bykc.fetchChosenCourses = async () => { throw new Error('bykc down') }
  const degraded = await harness.sync()
  assert.equal(degraded.entries.total, 1)
  assert.equal(degraded.bykc.failed, 'bykc down')
  assert.equal(harness.states.buaa.bykcError, 'bykc down')
  assert.ok([...harness.entries.values()].some(row => row.sourceKey === 'bykc:9527'))

  // Opt-out: the snapshot is left alone and no replace call is made.
  harness.states.buaa.bykcEnabled = false
  const skipped = await harness.sync()
  assert.equal(skipped.bykc, undefined)
  const writes = harness.calls.filter(call => call.source === 'buaa-bykc').length
  await harness.sync()
  assert.equal(harness.calls.filter(call => call.source === 'buaa-bykc').length, writes)
  assert.ok([...harness.entries.values()].some(row => row.sourceKey === 'bykc:9527'))
})

/** Minimal service harness shaped like test/sync.test.mjs's. */
function syncHarness({ bykc }) {
  const entries = new Map()
  const tasks = new Map()
  const states = { buaa: { buaaId: '23370001' } }
  const meta = { termStart: '2026-09-07' }
  let serial = 0
  const calls = []
  const service = {
    getMeta: () => meta,
    setMeta: async patch => Object.assign(meta, patch),
    getSourceState: source => states[source] ?? {},
    setSourceState: async (source, state) => { states[source] = structuredClone(state) },
    listEntries: () => [...entries.values()],
    replaceSourceEntries: async (source, inputs) => {
      calls.push(structuredClone({ source, inputs }))
      let created = 0, updated = 0, cleared = 0
      const remaining = new Set(inputs.map(input => input.sourceKey))
      for (const input of inputs) {
        const current = [...entries.values()].find(row => row.source === source && row.sourceKey === input.sourceKey)
        if (!current) { const id = `e${++serial}`; entries.set(id, { ...input, source, id }); created++ }
        else if (Object.keys(input).some(key => input[key] !== current[key])) { entries.set(current.id, { ...current, ...input }); updated++ }
      }
      for (const [id, row] of entries) if (row.source === source && !remaining.has(row.sourceKey)) { entries.delete(id); cleared++ }
      return { created, updated, cleared, total: inputs.length }
    },
    listTasks: () => [...tasks.values()],
    createTask: async input => { const id = `t${++serial}`; tasks.set(id, { ...input, id }); return tasks.get(id) },
    updateTask: async (id, patch) => { Object.assign(tasks.get(id), patch) },
    deleteTask: async id => { tasks.delete(id) },
  }
  const cell = { courseName: '数学', dayOfWeek: 2, beginTime: '08:00', endTime: '09:35', placeName: 'A101', weeksAndTeachers: '1周' }
  const jw = {
    ssoLogin: async () => ({}),
    fetchSchedule: async () => ({ datas: { code: '23370001', arrangedList: [cell], practiceList: [] } }),
    fetchExams: async () => ({ datas: [] }),
  }
  return {
    service, calls, entries, tasks, states, bykc, jw,
    sync: () => runSync({ service, jw, bykc }, { password: 'test-only' }),
  }
}
