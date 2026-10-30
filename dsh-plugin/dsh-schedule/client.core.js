/**
 * Shared client kernel: locale dictionaries, configured category helpers, the
 * `/api` client, data hooks, and the small UI atoms every page reuses.
 */
window.__ModuleLoader__.load({
  id: '@lidozs55/dsh-schedule/client.core.js',
  factory: (require) => {
    const React = require('react')
    const { useState, useEffect, useRef, useCallback } = React
    const h = React.createElement

    const API_PATH = '/api/schedule-core'

    // -- locale ---------------------------------------------------------------
    const zh = {
      'panel.calendar': '日程', 'panel.clipboard': '剪贴板', 'panel.settings': '日程设置',
      'tab.schedule': '日程', 'tab.tasks': '任务', 'tab.clipboard': '剪贴板',
      'toolbar.today': '回今天', 'toolbar.prev': '上一周', 'toolbar.next': '下一周',
      'toolbar.prevDay': '上一天', 'toolbar.nextDay': '下一天',
      'toolbar.day': '日', 'toolbar.week': '周',
      'toolbar.dayView': '日视图（单列）', 'toolbar.weekView': '周视图（7 列）',
      'toolbar.newEntry': '新建条目', 'toolbar.undo': '撤销', 'toolbar.redo': '重做',
      'toolbar.batch': '批量',
      'minical.title': '快速跳转', 'minical.month': '{year}年{month}月',
      'dt.weekdays': '日,一,二,三,四,五,六', 'dt.today': '今天',
      'dt.prevMonth': '上一月', 'dt.nextMonth': '下一月',
      'batch.title': '批量新建日程', 'batch.repeat': '重复',
      'batch.daily': '每天', 'batch.weekly': '指定星期几', 'batch.weekdays': '重复的星期几',
      'batch.startDate': '开始日期', 'batch.endDate': '结束日期',
      'batch.startTime': '开始时间', 'batch.endTime': '结束时间',
      'batch.count': '将创建 {count} 条日程',
      'batch.created': '批量创建完成：成功 {ok} 条，失败 {fail} 条',
      'batch.create': '批量创建', 'batch.creating': '创建中…',
      'batch.emptyRange': '请选择有效的日期范围与重复规则', 'batch.badRange': '结束时间需晚于开始时间',
      'week.prefix': '第', 'week.suffix': '教学周', 'week.unknown': '未设学期起点',
      'strip.upcoming': '24 小时内到期', 'strip.empty': '近 24 小时没有到期任务',
      'grid.newEvent': '新建事件', 'grid.jumpTo': '跳到这天', 'grid.today': '今天',
      'entry.title': '标题', 'entry.category': '类别', 'entry.start': '开始', 'entry.end': '结束',
      'entry.location': '地点', 'entry.lock': '锁定（不可拖动）',
      'entry.restoreFailed': '恢复条目失败，请重试撤销或重做。',
      'remind.lead': '提醒提前量', 'remind.default': '默认（跟随设置）', 'remind.atTime': '准时提醒',
      'remind.minutesBefore': '提前 {n} 分钟', 'remind.daysBefore': '提前 {n} 天',
      'entry.allDay': '全天', 'entry.description': '备注', 'entry.delete': '删除',
      'entry.save': '保存', 'entry.cancel': '取消', 'entry.edit': '编辑条目', 'entry.create': '新建条目',
      'task.title': '标题', 'task.type': '类别', 'task.due': '截止', 'task.priority': '优先级',
      'task.description': '备注', 'task.edit': '编辑任务', 'task.create': '新建任务',
      'task.delete': '删除', 'task.save': '保存', 'task.cancel': '取消',
      'task.filter': '状态', 'task.all': '全部', 'task.pending': '待完成', 'task.allPriorities': '全部优先级',
      'task.overdue': '已过期', 'task.today': '今日', 'task.week': '本周', 'task.later': '以后',
      'task.done': '已完成', 'task.progress': '今日进度',
      'task.empty': '暂无任务，点右上角「+ 新建任务」创建。',
      'confirm.deleteTitle': '确认删除', 'confirm.deleteEntry': '删除条目「{title}」？可通过「撤销」恢复。',
      'confirm.deleteTask': '删除任务「{title}」？此操作不可撤销。',
      'confirm.ok': '删除', 'confirm.cancel': '取消',
      'conflict.title': '时间冲突', 'conflict.proceed': '仍要保存',
      'clipboard.title': '剪贴板队列', 'clipboard.add': '添加一条', 'clipboard.send': '发送到新会话',
      'clipboard.hint': '复制的内容会自动出现在这里，也可以添加图片。点「发送到新会话」后，AI 会读取这些内容，把其中的安排和待办写入日程；重复内容只收录一次。',
      'clipboard.attach': '添加图片', 'clipboard.attachHint': '支持 PNG / JPEG / WebP / GIF；也可把图片文件拖到此面板。',
      'clipboard.image': '图片', 'clipboard.imageAdded': '已添加 {count} 张图片',
      'clipboard.imageType': '只支持 PNG / JPEG / WebP / GIF 图片',
      'clipboard.imageTooLarge': '图片「{name}」超过 {limit} MB，未加入队列',
      'clipboard.imageReadFail': '读取图片失败：{message}',
      'clipboard.queueFull': '队列最多 {count} 项，部分内容未加入',
      'clipboard.up': '上移', 'clipboard.down': '下移', 'clipboard.remove': '移除',
      'clipboard.empty': '队列为空。复制文字或添加图片后会出现在这里。',
      'clipboard.split': '按行拆分粘贴',
      'clipboard.clear': '清空队列', 'clipboard.clearHint': '清空全部 {count} 条队列内容？',
      'clipboard.sent': '已发送到新会话',
      'clipboard.sendFail': '发送失败：{message}',
      'settings.general': '通用', 'settings.termStart': '学期起点',
      'settings.categories': '类别与颜色', 'settings.addCategory': '新增类别',
      'settings.saveCategories': '保存类别', 'settings.newCategory': '新类别',
      'settings.categoryName': '类别名称', 'settings.categoryColor': '颜色',
      'settings.categoryHint': '删除类别后，已有日程归入「其它」。',
      'settings.deleteCategoryHint': '删除「{name}」后，已有条目会归入「其它」；点「保存类别」后生效。',
      'settings.otherProtected': '其它不可删除', 'settings.categoryNameRequired': '类别名称不能为空',
      'settings.unsaved': '有未保存修改',
      'settings.termHint': '第一周周一；留空不显示教学周。',
      'settings.saved': '已保存',
      'settings.backup': '备份与恢复', 'settings.clearTitle': '清空数据',
      'settings.backupHint': '导出全部日程与任务为 JSON 文件；导入时同名同时间的内容会跳过，不覆盖已有数据。备份不含学号、来源设置或登录会话。',
      'settings.dataTitle': '数据管理', 'settings.export': '导出 JSON', 'settings.import': '导入 JSON',
      'settings.imported': '导入完成：{summary}', 'settings.importFail': '导入失败：{message}',
      'settings.importSummary': '条目 {entries}（跳过 {skippedEntries}），任务 {tasks}（跳过 {skippedTasks}）',
      'settings.clearAll': '清除全部日程数据',
      'settings.clearAllShort': '删除所有日程与任务，不可撤销。',
      'settings.clearAllMore': '设置会保留，来源同步仍会继续写入；如不希望数据被重新生成，请先关闭对应来源的同步。',
      'settings.clearAllHint': '设置会保留，来源同步仍会继续写入；如不希望数据被重新生成，请先关闭对应来源的同步。',
      'settings.clearAllConfirm': '清空', 'settings.clearedAll': '已清除 {count} 条日程数据',
      'notify.taskTitle': '任务提醒', 'notify.entryTitle': '日程提醒',
      'notify.taskBody': '「{title}」将于 {time} 截止',
      'notify.entryBody': '「{title}」将于 {time} 开始{location}',
      'notify.entryAllDay': '「{title}」{date} 全天{location}',
      'state.error': '出错了：{message}', 'state.loading': '加载中…', 'state.retry': '重试',
      'cat.course': '课程', 'cat.homework': '作业', 'cat.exam': '考试', 'cat.meeting': '会议',
      'cat.study': '学习', 'cat.sports': '运动', 'cat.other': '其它',
      'type.homework': '作业', 'type.exam': '考试', 'type.lecture': '听课', 'type.other': '其它',
      'prio.high': '高', 'prio.medium': '中', 'prio.low': '低',
    }
    const en = {
      'panel.calendar': 'Schedule', 'panel.clipboard': 'Clipboard', 'panel.settings': 'Schedule settings',
      'tab.schedule': 'Schedule', 'tab.tasks': 'Tasks', 'tab.clipboard': 'Clipboard',
      'toolbar.today': 'Today', 'toolbar.prev': 'Prev week', 'toolbar.next': 'Next week',
      'toolbar.prevDay': 'Prev day', 'toolbar.nextDay': 'Next day',
      'toolbar.day': 'Day', 'toolbar.week': 'Week',
      'toolbar.dayView': 'Day view (single column)', 'toolbar.weekView': 'Week view (7 columns)',
      'toolbar.newEntry': 'New entry', 'toolbar.undo': 'Undo', 'toolbar.redo': 'Redo',
      'toolbar.batch': 'Batch',
      'minical.title': 'Quick jump', 'minical.month': '{month}/{year}',
      'dt.weekdays': 'Su,Mo,Tu,We,Th,Fr,Sa', 'dt.today': 'Today',
      'dt.prevMonth': 'Previous month', 'dt.nextMonth': 'Next month',
      'batch.title': 'Batch-create entries', 'batch.repeat': 'Repeat',
      'batch.daily': 'Every day', 'batch.weekly': 'Chosen weekdays', 'batch.weekdays': 'Weekdays to repeat',
      'batch.startDate': 'Start date', 'batch.endDate': 'End date',
      'batch.startTime': 'Start time', 'batch.endTime': 'End time',
      'batch.count': 'Will create {count} entries',
      'batch.created': 'Batch done: {ok} created, {fail} failed',
      'batch.create': 'Create all', 'batch.creating': 'Creating…',
      'batch.emptyRange': 'Pick a valid date range and repeat rule', 'batch.badRange': 'End time must be after start time',
      'week.prefix': 'Week', 'week.suffix': '', 'week.unknown': 'No term start set',
      'strip.upcoming': 'Due in the next 24 hours', 'strip.empty': 'Nothing due in the next 24 hours',
      'grid.newEvent': 'New event', 'grid.jumpTo': 'Jump to this day', 'grid.today': 'Today',
      'entry.title': 'Title', 'entry.category': 'Category', 'entry.start': 'Start', 'entry.end': 'End',
      'entry.location': 'Location', 'entry.lock': 'Locked (no dragging)',
      'entry.restoreFailed': 'Could not restore entries; retry undo or redo.',
      'remind.lead': 'Reminder lead', 'remind.default': 'Default (follows settings)', 'remind.atTime': 'On time',
      'remind.minutesBefore': '{n} min before', 'remind.daysBefore': '{n} day(s) before',
      'entry.allDay': 'All day', 'entry.description': 'Notes', 'entry.delete': 'Delete',
      'entry.save': 'Save', 'entry.cancel': 'Cancel', 'entry.edit': 'Edit entry', 'entry.create': 'New entry',
      'task.title': 'Title', 'task.type': 'Type', 'task.due': 'Due', 'task.priority': 'Priority',
      'task.description': 'Notes', 'task.edit': 'Edit task', 'task.create': 'New task',
      'task.delete': 'Delete', 'task.save': 'Save', 'task.cancel': 'Cancel',
      'task.filter': 'Status', 'task.all': 'All', 'task.pending': 'Pending', 'task.allPriorities': 'All priorities',
      'task.overdue': 'Overdue', 'task.today': 'Today', 'task.week': 'This week', 'task.later': 'Later',
      'task.done': 'Completed', 'task.progress': 'Today',
      'task.empty': 'No tasks yet. Use “+ New task” above to create one.',
      'confirm.deleteTitle': 'Confirm deletion', 'confirm.deleteEntry': 'Delete entry "{title}"? You can restore it with Undo.',
      'confirm.deleteTask': 'Delete task "{title}"? This cannot be undone.',
      'confirm.ok': 'Delete', 'confirm.cancel': 'Cancel',
      'conflict.title': 'Time conflict', 'conflict.proceed': 'Save anyway',
      'clipboard.title': 'Clipboard queue', 'clipboard.add': 'Add item', 'clipboard.send': 'Send to new session',
      'clipboard.hint': 'Copied text lands here automatically; images can be added too. "Send to new session" hands the queue to the AI, which writes the plans and todos it finds into the schedule. Identical content is queued once.',
      'clipboard.attach': 'Add images', 'clipboard.attachHint': 'Supports PNG / JPEG / WebP / GIF; you can also drop image files onto this panel.',
      'clipboard.image': 'Image', 'clipboard.imageAdded': 'Added {count} image(s)',
      'clipboard.imageType': 'Only PNG / JPEG / WebP / GIF images are supported',
      'clipboard.imageTooLarge': 'Image "{name}" exceeds {limit} MB and was not added',
      'clipboard.imageReadFail': 'Could not read image: {message}',
      'clipboard.queueFull': 'The queue holds {count} items; some content was not added',
      'clipboard.up': 'Move up', 'clipboard.down': 'Move down', 'clipboard.remove': 'Remove',
      'clipboard.empty': 'Queue is empty. Copy text or add images and they will appear here.',
      'clipboard.split': 'Split paste by lines',
      'clipboard.clear': 'Clear queue', 'clipboard.clearHint': 'Clear all {count} queued items?',
      'clipboard.sent': 'Sent to a new session',
      'clipboard.sendFail': 'Send failed: {message}',
      'settings.general': 'General', 'settings.termStart': 'Term start',
      'settings.categories': 'Categories and colors', 'settings.addCategory': 'Add category',
      'settings.saveCategories': 'Save categories', 'settings.newCategory': 'New category',
      'settings.categoryName': 'Category name', 'settings.categoryColor': 'Color',
      'settings.categoryHint': 'Entries in deleted categories move to Other.',
      'settings.deleteCategoryHint': 'Deleting "{name}" moves existing entries to "Other"; this takes effect when you save the categories.',
      'settings.otherProtected': 'Other cannot be deleted', 'settings.categoryNameRequired': 'Category name is required',
      'settings.unsaved': 'Unsaved changes',
      'settings.termHint': 'Monday of week 1. Leave empty to hide teaching weeks.',
      'settings.saved': 'Saved',
      'settings.backup': 'Backup & restore', 'settings.clearTitle': 'Clear data',
      'settings.backupHint': 'Exports all entries and tasks as JSON; imports skip matching names and times without overwriting existing items. Backups exclude student IDs, source settings and login sessions.',
      'settings.dataTitle': 'Data management', 'settings.export': 'Export JSON', 'settings.import': 'Import JSON',
      'settings.imported': 'Import done: {summary}', 'settings.importFail': 'Import failed: {message}',
      'settings.importSummary': 'Entries {entries} ({skippedEntries} skipped), tasks {tasks} ({skippedTasks} skipped)',
      'settings.clearAll': 'Clear all schedule data',
      'settings.clearAllShort': 'Permanently deletes all entries and tasks.',
      'settings.clearAllMore': 'Settings are kept and source sync keeps writing; to prevent data from being recreated, turn off that source\'s sync first.',
      'settings.clearAllHint': 'Settings are kept and source sync keeps writing; to prevent data from being recreated, turn off that source\'s sync first.',
      'settings.clearAllConfirm': 'Clear', 'settings.clearedAll': 'Cleared {count} rows',
      'notify.taskTitle': 'Task reminder', 'notify.entryTitle': 'Schedule reminder',
      'notify.taskBody': '"{title}" is due at {time}',
      'notify.entryBody': '"{title}" starts at {time}{location}',
      'notify.entryAllDay': '"{title}" is all day on {date}{location}',
      'state.error': 'Error: {message}', 'state.loading': 'Loading…', 'state.retry': 'Retry',
      'cat.course': 'Course', 'cat.homework': 'Homework', 'cat.exam': 'Exam', 'cat.meeting': 'Meeting',
      'cat.study': 'Study', 'cat.sports': 'Sports', 'cat.other': 'Other',
      'type.homework': 'Homework', 'type.exam': 'Exam', 'type.lecture': 'Lecture', 'type.other': 'Other',
      'prio.high': 'High', 'prio.medium': 'Medium', 'prio.low': 'Low',
    }

    // Cross-end copy of host/model.js DEFAULT_CATEGORIES — keep in sync with
    // host/model.js (no runtime sharing between host and client). Defaults
    // are only a bootstrap/legacy fallback, never merged into a configured
    // list: a deleted preset must stay deleted.
    const DEFAULT_CATEGORIES = [
      { id: 'course', name: '课程', color: '#3B82F6' },
      { id: 'homework', name: '作业', color: '#F59E0B' },
      { id: 'exam', name: '考试', color: '#EF4444' },
      { id: 'meeting', name: '会议', color: '#A855F7' },
      { id: 'study', name: '学习', color: '#06B6D4' },
      { id: 'sports', name: '运动', color: '#22C55E' },
      { id: 'other', name: '其它', color: '#64748B' },
    ]
    const categoriesOrDefault = categories => Array.isArray(categories) ? categories : DEFAULT_CATEGORIES
    const categoryId = (id, categories) => categoriesOrDefault(categories).some(cat => cat.id === id) ? id : 'other'
    const categoryInfo = (id, categories) => {
      const list = categoriesOrDefault(categories)
      return list.find(cat => cat.id === id) ?? list.find(cat => cat.id === 'other') ?? DEFAULT_CATEGORIES[6]
    }
    const categoryName = (id, categories) => categoryInfo(id, categories).name
    const categoryColor = (id, categories) => categoryInfo(id, categories).color
    const categoryStyle = (id, categories) => ({ '--bsch-block-color': categoryColor(id, categories) })
    function CategoryPreview({ category, categories, title }) {
      return h('div', { className: 'bsch-block bsch-category-preview', style: categoryStyle(category, categories) },
        h('div', { className: 'bsch-block-title' }, title || categoryName(category, categories)),
        h('div', { className: 'bsch-block-sub' }, '09:00–10:00'))
    }

    // Undo closures outlive their editor and its category snapshot. Resolve
    // against current server metadata before recreating/restoring old inputs.
    async function currentCategoryInputs(api, inputs) {
      const categories = typeof api.snapshot === 'function' ? (await api.snapshot()).global?.categories : undefined
      return inputs.map(input => ({ ...input, category: categoryId(input.category, categories) }))
    }

    /** Recreate entries for an undo/redo step: batch-create with conflicts
     *  allowed; on partial failure delete whatever was restored, refresh,
     *  and rethrow so the undo stack keeps the step retryable. Returns the
     *  restored ids (fresh — ids are never stable across recreate cycles). */
    async function recreateEntries(api, inputs, refresh, t) {
      const results = await api.batchCreateEntries(await currentCategoryInputs(api, inputs), { allowConflicts: true })
      const restoredIds = results.filter(row => row.ok).map(row => row.id)
      const failed = results.find(row => !row.ok)
      if (failed) {
        // Do not duplicate partial restores; the undo step stays retryable.
        if (restoredIds.length) await api.deleteEntry(restoredIds)
        await refresh()
        throw new Error(failed.message ?? t('entry.restoreFailed'))
      }
      await refresh()
      return restoredIds
    }

    // -- time helpers (the one canonical copy; chunks import from here) --
    const pad2 = n => String(n).padStart(2, '0')
    const dateKey = date =>
      `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`

    /** Format a Date as local wall time with an explicit zone offset. */
    function dateToZonedIso(date) {
      const off = -date.getTimezoneOffset()
      const sign = off >= 0 ? '+' : '-'
      const abs = Math.abs(off)
      const zone = `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
      return `${dateKey(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:00${zone}`
    }

    const addDays = (key, days) => {
      const date = new Date(key + 'T12:00:00')
      date.setDate(date.getDate() + days)
      return dateKey(date)
    }

    /** Zoned ISO for a `YYYY-MM-DD` day plus minutes-from-midnight. */
    const zonedAt = (dayKey, minutes) => {
      const [y, m, d] = dayKey.split('-').map(Number)
      return dateToZonedIso(new Date(y, m - 1, d, 0, minutes))
    }

    // -- /api client ------------------------------------------------------------
    class ApiError extends Error {
      constructor(payload) {
        super(payload.message)
        this.code = payload.code
        this.details = payload.details
      }
    }

    async function parseResult(response) {
      let body
      try {
        body = await response.json()
      } catch {
        throw new Error(`HTTP ${response.status}`)
      }
      if (body && body.ok) return body.value
      throw new ApiError(body?.error ?? { code: 'http_' + response.status, message: `HTTP ${response.status}` })
    }

    function createApi(fetchImpl) {
      const doFetch = fetchImpl ?? ((...args) => globalThis.fetch(...args))
      const post = (op, payload) => doFetch(API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op, ...payload }),
      }).then(parseResult)
      return {
        // Omit the param when nullish — `encodeURIComponent(undefined)`
        // would smuggle the string "undefined" into the snapshot (P7).
        snapshot: weekStart => {
          const url = weekStart === null || weekStart === undefined
            ? API_PATH
            : `${API_PATH}?weekStart=${encodeURIComponent(weekStart)}`
          return doFetch(url).then(parseResult)
        },
        /** Reminder moments for the notification poller (server-derived). */
        reminders: () => doFetch(`${API_PATH}?view=reminders`).then(parseResult),
        createEntry: (input, opts) => post('createEntry', { input, ...opts }),
        updateEntry: (id, patch, opts) => post('updateEntry', { id, patch, ...opts }),
        moveEntry: (moves, opts) => post('moveEntry', { moves, ...opts }),
        deleteEntry: ids => post('deleteEntry', { ids }),
        batchCreateEntries: (inputs, opts) => post('batchCreateEntries', { inputs, ...opts }),
        createTask: input => post('createTask', { input }),
        updateTask: (id, patch) => post('updateTask', { id, patch }),
        setTaskCompleted: (id, completed) => post('setTaskCompleted', { id, completed }),
        deleteTask: id => post('deleteTask', { id }),
        setMeta: patch => post('setMeta', { patch }),
        setCategories: categories => post('setCategories', { categories }),
        exportData: () => post('export', {}),
        importData: payload => post('import', { payload }),
        clearAllData: () => post('clearAllData', {}),
        /** Confirmed pet drops (vivarium bridge); the client opens a session. */
        listConfirmedDrops: () => post('listConfirmedDrops', {}),
        /**
         * Remove delivered rows after the prompt is accepted. `sessionId`
         * tells the host which Agent session got the material, so the pet
         * bridge can follow that session's questions.
         */
        ackDrops: (ids, sessionId) => post('ackDrops', { ids, sessionId }),
      }
    }

    // -- cross-surface data pulse ----------------------------------------------
    // No push channel exists for plugin data (D-1), so a surface that
    // finishes a bulk write outside the calendar panel (a settings import
    // card, a source adapter's sync) pulses this same-window event; every
    // mounted useScheduleData refreshes immediately instead of waiting out
    // the 20-second revision poll. Unmounted panels need nothing — their
    // mount effect fetches fresh data anyway. Source adapters dispatch the
    // literal event name; this kernel owns the contract.
    const DATA_CHANGED_EVENT = 'schedule:data-changed'
    const notifyDataChanged = () => {
      window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT))
    }

    // -- hooks ------------------------------------------------------------------
    /** Load the weekly snapshot, refresh on week change, mutation, the
     *  `schedule:data-changed` pulse, and a 20-second revision poll (no push
     *  channel exists for plugin data). */
    function useScheduleData(api, timer, weekStart) {
      const [data, setData] = useState(null)
      const [error, setError] = useState(null)
      const weekRef = useRef(weekStart)
      weekRef.current = weekStart

      const refresh = useCallback(async () => {
        try {
          const snapshot = await api.snapshot(weekRef.current)
          // A response for an anchor the view has already left must not
          // take the grid over: rapid flips can land out of order, and the
          // displayed pair stays self-consistent only if the state tracks
          // the CURRENT anchor (the view holds the previous snapshot until
          // this anchor's own fetch lands). The anchor-less root snapshot
          // always echoes today's anchor and passes.
          if (weekRef.current != null && snapshot.weekStart !== weekRef.current) return
          setError(null)
          // Dedupe polls by revision — but a week switch re-fetches with an
          // unchanged revision, so the anchor must join the check or the
          // old week's rows would render against the new week's grid.
          setData(prev => (prev !== null
            && prev.revision === snapshot.revision
            && prev.weekStart === snapshot.weekStart
            ? prev
            : snapshot))
        } catch (cause) {
          setError(cause.message ?? String(cause))
        }
      }, [api])

      useEffect(() => { void refresh() }, [refresh, weekStart])
      useEffect(() => {
        const onDataChanged = () => { void refresh() }
        window.addEventListener(DATA_CHANGED_EVENT, onDataChanged)
        return () => window.removeEventListener(DATA_CHANGED_EVENT, onDataChanged)
      }, [refresh])
      useEffect(() => {
        if (!timer) return undefined
        return timer.interval(() => { void refresh() }, 20_000)
      }, [timer, refresh])

      return { data, error, refresh }
    }

    /** Undo/redo double stack, each capped at 5 (docs/10 P5): entries are
     *  `{undo, redo, label}`; a new push clears the redo stack.
     *
     *  The stacks live in a ref (state only mirrors them for rendering):
     *  mutations arrive from async UI callbacks (delete -> push after an
     *  await) and from keyboard handlers that may still hold the previous
     *  render's closure. Reading `stacks` from a closure let a push land
     *  between that render and the next Ctrl+Z, so the undo step saw an old
     *  (or empty) stack and the earlier operations became unreachable. */
    function useUndo(refresh) {
      const stacksRef = useRef({ undo: [], redo: [] })
      const [error, setError] = useState(null)
      const [, bump] = useState(0) // re-render for canUndo/canRedo only
      const busy = useRef(false)
      const commit = useCallback(next => {
        stacksRef.current = next
        bump(value => value + 1)
      }, [])
      const push = useCallback(entry => {
        const current = stacksRef.current
        commit({ undo: [...current.undo, entry].slice(-5), redo: [] })
      }, [commit])
      const step = useCallback(async direction => {
        if (busy.current) return
        const from = stacksRef.current[direction]
        const entry = from[from.length - 1]
        if (entry === undefined) return
        busy.current = true
        setError(null)
        try {
          await entry[direction]()
          const current = stacksRef.current
          // Remove THIS entry by identity, not "the current top": an async
          // operation may have been pushed while the undo was in flight, and
          // slicing the top would silently discard that newer step.
          const remove = list => {
            const index = list.lastIndexOf(entry)
            return index === -1
              ? list
              : [...list.slice(0, index), ...list.slice(index + 1)]
          }
          commit(direction === 'undo'
            ? { undo: remove(current.undo), redo: [...current.redo, entry].slice(-5) }
            : { undo: [...current.undo, entry].slice(-5), redo: remove(current.redo) })
          await refresh()
        } catch (cause) {
          setError(cause.message ?? String(cause))
        } finally {
          busy.current = false
        }
      }, [commit, refresh])
      return {
        push,
        undo: useCallback(() => void step('undo'), [step]),
        redo: useCallback(() => void step('redo'), [step]),
        error,
        canUndo: stacksRef.current.undo.length > 0,
        canRedo: stacksRef.current.redo.length > 0,
      }
    }

    // -- UI atoms ----------------------------------------------------------------
    function Modal({ title, onClose, children }) {
      useEffect(() => {
        const onKey = event => {
          // A nested popover (select/date/time) consumes Escape first and
          // preventDefaults it; only a bare Escape closes the dialog.
          if (event.key === 'Escape' && !event.defaultPrevented) onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])
      return h('div', { className: 'bsch-modal-mask', onMouseDown: e => e.target === e.currentTarget && onClose() },
        h('div', { className: 'bsch-modal', role: 'dialog', 'aria-label': title },
          h('div', { className: 'bsch-modal-title' }, title),
          children))
    }

    function ConfirmDialog({ t, title, message, confirmLabel, onConfirm, onCancel }) {
      return h(Modal, { title, onClose: onCancel },
        h('div', null, message),
        h('div', { className: 'bsch-modal-actions' },
          h('button', { className: 'bsch-btn', onClick: onCancel }, t('confirm.cancel')),
          h('button', { className: 'bsch-btn is-danger', onClick: onConfirm }, confirmLabel)))
    }

    const field = (labelText, input) =>
      h('div', { className: 'bsch-field' }, h('label', null, labelText), input)

    // -- hover tips ---------------------------------------------------------------
    // The tip is promoted to the document's TOP LAYER via the Popover API:
    // host surfaces (the settings page, dialogs, overlays) sit in their own
    // stacking contexts that a body-appended fixed element cannot reliably
    // rise above — the top layer is above every one of them by definition,
    // and immune to scroll-container clipping. Engines without the API fall
    // back to plain body-fixed placement.
    let tipEl = null
    const hideTip = () => {
      if (tipEl === null) return
      try { if (tipEl.matches(':popover-open')) tipEl.hidePopover() } catch { /* not shown */ }
      tipEl.remove()
      tipEl = null
    }
    const showTip = (anchor, text) => {
      hideTip()
      if (!text || anchor === null || anchor === undefined || !anchor.isConnected) return
      const tip = document.createElement('div')
      tip.className = 'bsch-tip'
      tip.setAttribute('role', 'tooltip')
      tip.textContent = text
      if (typeof tip.showPopover === 'function') tip.popover = 'manual'
      document.body.append(tip)
      if (tip.popover === 'manual') {
        try { tip.showPopover() } catch { /* already shown */ }
      }
      tip.style.width = `${Math.min(300, window.innerWidth - 24)}px`
      const rect = anchor.getBoundingClientRect()
      const box = tip.getBoundingClientRect()
      const left = Math.min(Math.max(12, rect.left + rect.width / 2 - box.width / 2), window.innerWidth - 12 - box.width)
      const top = rect.bottom + box.height + 18 > window.innerHeight
        ? rect.top - box.height - 6
        : rect.bottom + 6
      tip.style.left = `${left}px`
      tip.style.top = `${Math.max(12, top)}px`
      tipEl = tip
    }

    /**
     * A small "?" that expands low-frequency explanation on hover/focus.
     * Pure presentation; placement and clipping are `showTip`'s job.
     */
    function HelpTip({ text, label }) {
      const ref = useRef(null)
      useEffect(() => {
        const el = ref.current
        if (el === null || !text) return undefined
        const enter = () => showTip(el, text)
        const leave = () => hideTip()
        el.addEventListener('pointerenter', enter)
        el.addEventListener('pointerleave', leave)
        el.addEventListener('focusin', enter)
        el.addEventListener('focusout', leave)
        return () => {
          el.removeEventListener('pointerenter', enter)
          el.removeEventListener('pointerleave', leave)
          el.removeEventListener('focusin', enter)
          el.removeEventListener('focusout', leave)
          hideTip()
        }
      }, [text])
      if (!text) return null
      return h('button', {
        type: 'button', className: 'bsch-helptip-btn', ref, 'aria-label': label ?? text,
      }, '?')
    }

    // -- form popovers -----------------------------------------------------------
    // Native <option> cannot carry a color dot and datetime-local renders as a
    // bare OS control, so the editors use these popover-based controls. All of
    // them anchor to .bsch-selectbox; before opening they measure against the
    // nearest clipping ancestor (the modal scrolls) and flip up / right-align
    // when the popover would not fit below/left-anchored.

    const measureAnchor = (anchor, width) => {
      const rect = anchor?.getBoundingClientRect()
      if (rect == null) return { up: false, right: false }
      let box = anchor.parentElement
      while (box != null && box !== document.body) {
        const style = window.getComputedStyle(box)
        if (/(auto|scroll|hidden)/.test(`${style.overflow}${style.overflowX}${style.overflowY}`)) break
        box = box.parentElement
      }
      const limit = (box ?? document.documentElement).getBoundingClientRect()
      return {
        up: rect.bottom + 300 > limit.bottom && rect.top - limit.top > 320,
        right: rect.left + width > limit.right - 8,
      }
    }

    /** Single-choice dropdown. `options`: `{ value, label, color? }[]`. */
    function Select({ value, options, onChange, ariaLabel }) {
      const root = useRef(null)
      const [open, setOpen] = useState(false)
      const [up, setUp] = useState(false)
      const [active, setActive] = useState(-1)
      const current = options.find(option => option.value === value) ?? options[0]
      const close = () => { setOpen(false); setActive(-1) }
      const toggle = () => {
        if (open) { close(); return }
        setUp(measureAnchor(root.current, 240).up)
        setOpen(true)
      }
      const pick = option => { close(); if (option.value !== value) onChange(option.value) }
      const onKeyDown = event => {
        if (event.key === 'Escape') { if (open) { event.preventDefault(); close() } return }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          if (!open) { setUp(measureAnchor(root.current, 240).up); setOpen(true); setActive(0); return }
          setActive(index => {
            const delta = event.key === 'ArrowDown' ? 1 : -1
            const next = index === -1 ? (delta === 1 ? 0 : options.length - 1) : index + delta
            return Math.max(0, Math.min(options.length - 1, next))
          })
        } else if ((event.key === 'Enter' || event.key === ' ') && open) {
          event.preventDefault()
          const option = options[active] ?? current
          if (option !== undefined) pick(option)
        }
      }
      return h('div', { className: `bsch-selectbox${open ? ' is-open' : ''}${up ? ' is-up' : ''}`, ref: root },
        h('button', {
          type: 'button', className: 'bsch-select-btn', 'aria-haspopup': 'listbox',
          'aria-expanded': open, 'aria-label': ariaLabel, onClick: toggle, onKeyDown,
        },
        current?.color ? h('span', { className: 'bsch-dot', style: { background: current.color }, 'aria-hidden': true }) : null,
        h('span', { className: 'bsch-select-btn-label' }, current?.label ?? ''),
        h('span', { className: 'bsch-caret', 'aria-hidden': true }, '▾')),
        open ? h('div', { className: 'bsch-pop-mask', onClick: close }) : null,
        open ? h('div', { className: 'bsch-select-menu', role: 'listbox', 'aria-label': ariaLabel },
          options.map((option, index) => h('button', {
            type: 'button', role: 'option', key: option.value,
            'aria-selected': option.value === value,
            className: `bsch-select-option${option.value === value ? ' is-selected' : ''}${index === active ? ' is-active' : ''}`,
            onMouseEnter: () => setActive(index),
            onClick: () => pick(option),
          },
          option.color ? h('span', { className: 'bsch-dot', style: { background: option.color }, 'aria-hidden': true }) : null,
          h('span', { className: 'bsch-select-btn-label' }, option.label)))) : null)
    }

    /** Bare Sunday-first month grid; `onShift(delta)` moves the month.
     *  `dots` (optional) maps a day key to `{ title, color }[]` category
     *  dots rendered under the day number (at most three). */
    function MonthGrid({ t, cursor, onShift, selected, onPick, plain, dots }) {
      const first = new Date(cursor.year, cursor.month, 1)
      const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate()
      const todayKey = dateKey(new Date())
      const cells = [
        ...Array.from({ length: first.getDay() }, (_, i) =>
          h('div', { key: `e${i}`, className: 'bsch-mc-day is-empty' })),
        ...Array.from({ length: daysInMonth }, (_, i) => {
          const key = `${cursor.year}-${pad2(cursor.month + 1)}-${pad2(i + 1)}`
          const dayDots = (dots?.[key] ?? []).slice(0, 3)
          return h('div', {
            key,
            className: ['bsch-mc-day', key === todayKey ? 'is-today' : '',
              key === selected ? 'is-selected' : '',
              dayDots.length ? 'has-dot' : ''].filter(Boolean).join(' '),
            onClick: () => onPick(key),
          }, String(i + 1),
          dayDots.length ? h('span', { className: 'bsch-mc-dots' }, dayDots.map((dot, index) =>
            h('span', { key: index, className: 'bsch-mc-dot', title: dot.title,
              style: { background: dot.color } }))) : null)
        }),
      ]
      return h('div', { className: plain ? 'bsch-mc bsch-mc-plain' : 'bsch-mc' },
        h('div', { className: 'bsch-mc-head' },
          h('button', {
            type: 'button', className: 'bsch-btn', 'aria-label': t('dt.prevMonth'),
            onClick: () => onShift(-1),
          }, '‹'),
          h('span', { className: 'bsch-mc-month' },
            t('minical.month')
              .replace('{year}', String(cursor.year))
              .replace('{month}', pad2(cursor.month + 1))),
          h('button', {
            type: 'button', className: 'bsch-btn', 'aria-label': t('dt.nextMonth'),
            onClick: () => onShift(1),
          }, '›')),
        h('div', { className: 'bsch-mc-weekdays' },
          t('dt.weekdays').split(',').map(day => h('span', { key: day }, day))),
        h('div', { className: 'bsch-mc-grid' }, cells))
    }

    /** `YYYY-MM-DD` chip opening the month grid plus a Today shortcut. */
    function DateField({ t, value, onChange, ariaLabel }) {
      const root = useRef(null)
      const [open, setOpen] = useState(false)
      const [up, setUp] = useState(false)
      const [right, setRight] = useState(false)
      const monthOf = key =>
        ({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) - 1 })
      const [cursor, setCursor] = useState(() => monthOf(value))
      const close = () => setOpen(false)
      const toggle = () => {
        if (open) { close(); return }
        setCursor(monthOf(value))
        const fit = measureAnchor(root.current, 260)
        setUp(fit.up)
        setRight(fit.right)
        setOpen(true)
      }
      const today = dateKey(new Date())
      return h('div', { className: `bsch-selectbox${open ? ' is-open' : ''}${up ? ' is-up' : ''}${right ? ' is-right' : ''}`, ref: root },
        h('button', {
          type: 'button', className: 'bsch-select-btn', 'aria-haspopup': 'dialog',
          'aria-expanded': open, 'aria-label': ariaLabel, onClick: toggle,
        },
        h('span', { className: 'bsch-select-btn-label' }, value),
        h('span', { className: 'bsch-caret', 'aria-hidden': true }, '▾')),
        open ? h('div', { className: 'bsch-pop-mask', onClick: close }) : null,
        open ? h('div', { className: 'bsch-popover bsch-cal' },
          h(MonthGrid, {
            t, cursor, plain: true, selected: value, onShift: delta =>
              setCursor(current => {
                const date = new Date(current.year, current.month + delta, 1)
                return { year: date.getFullYear(), month: date.getMonth() }
              }),
            onPick: key => { close(); if (key !== value) onChange(key) },
          }),
          h('button', {
            type: 'button', className: 'bsch-btn bsch-cal-today',
            onClick: () => { close(); if (today !== value) onChange(today) },
          }, t('dt.today'))) : null)
    }

    const HALF_HOURS = Array.from({ length: 48 }, (_, i) => `${pad2(i >> 1)}:${i % 2 ? '30' : '00'}`)

    /** `HH:mm` chip: exact native time input plus half-hour quick steps. */
    function TimeField({ value, onChange, ariaLabel }) {
      const root = useRef(null)
      const [open, setOpen] = useState(false)
      const [up, setUp] = useState(false)
      const [right, setRight] = useState(false)
      const close = () => setOpen(false)
      const toggle = () => {
        if (open) { close(); return }
        const fit = measureAnchor(root.current, 240)
        setUp(fit.up)
        setRight(fit.right)
        setOpen(true)
      }
      return h('div', { className: `bsch-selectbox${open ? ' is-open' : ''}${up ? ' is-up' : ''}${right ? ' is-right' : ''}`, ref: root },
        h('button', {
          type: 'button', className: 'bsch-select-btn', 'aria-haspopup': 'dialog',
          'aria-expanded': open, 'aria-label': ariaLabel, onClick: toggle,
        },
        h('span', { className: 'bsch-select-btn-label' }, value),
        h('span', { className: 'bsch-caret', 'aria-hidden': true }, '▾')),
        open ? h('div', { className: 'bsch-pop-mask', onClick: close }) : null,
        open ? h('div', { className: 'bsch-timepop' },
          h('input', {
            type: 'time', className: 'bsch-input', value, 'aria-label': ariaLabel,
            onChange: e => { if (e.target.value !== '') onChange(e.target.value) },
          }),
          h('div', { className: 'bsch-timegrid' }, HALF_HOURS.map(time => h('button', {
            type: 'button', key: time,
            className: `bsch-timegrid-btn${time === value ? ' is-selected' : ''}`,
            onClick: () => { close(); if (time !== value) onChange(time) },
          }, time)))) : null)
    }

    return {
      React, h, useState, useEffect, useRef, useCallback,
      DATA_CHANGED_EVENT,
      zh, en, DEFAULT_CATEGORIES, categoriesOrDefault, categoryId, categoryName, categoryColor, categoryStyle, CategoryPreview, currentCategoryInputs, recreateEntries,
      pad2, dateKey, dateToZonedIso, addDays, zonedAt,
      createApi, ApiError, useScheduleData, useUndo, notifyDataChanged,
      Modal, ConfirmDialog, field, HelpTip,
      showTip, hideTip,
      Select, MonthGrid, DateField, TimeField,
    }
  },
})
