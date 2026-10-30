/**
 * Entry editor dialog: the manual (no-LLM) creation path. Conflict
 * rejections come back with reasons; the user can retry allowing overlap.
 * Create/update/delete each push an undo entry (docs/10 P5) — undoing a
 * delete recreates the row (a new id; ids are not stable across cycles).
 * BatchEditor ports the legacy 批量新建日程 (BatchAddModal): one entry per
 * matching day inside a date range, daily or on chosen weekdays.
 */
window.__ModuleLoader__.load({
  id: '@lidozs55/dsh-schedule/client.editors.js',
  factory: (require) => {
    const core = require('@lidozs55/dsh-schedule/client.core.js')
    const gridm = require('@lidozs55/dsh-schedule/client.gridmath.js')
    const { React, h, field, pad2, dateKey } = core
    const { useState, useMemo } = React
    const { Modal, ConfirmDialog, Select, DateField, TimeField } = core

    const { categoriesOrDefault, categoryId, currentCategoryInputs, recreateEntries } = core

    /** `YYYY-MM-DDTHH:mm`, browser-local wall time — sliced into the
     *  separate date/time chip states of the editors. */
    const toLocalInput = iso => {
      const date = new Date(iso)
      return `${dateKey(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
    }

    /**
     * @param {object} props - `{ t, initial, api, undoApi?, refresh?, draft,
     *   renderSlot?, onClose, onSaved }`; `initial` null means create (with
     *   `draft` start/end), else edit. `undoApi`/`refresh` arm the undo stack.
     *   `renderSlot` is the core's auto-injected child-slot outlet; source
     *   adapters use it for entry actions (e.g. remote check-in).
     */
    function EventEditor(props) {
      const { t, initial, api, undoApi, refresh, onClose, onSaved, renderSlot } = props
      const draft = props.draft ?? {}
      const categories = categoriesOrDefault(props.categories)
      const [title, setTitle] = useState(initial?.title ?? '')
      const [category, setCategory] = useState(initial?.category ?? 'other')
      const startInit = toLocalInput(initial?.start ?? draft.start ?? new Date())
      const endInit = toLocalInput(initial?.end ?? draft.end ?? new Date(Date.now() + 3_600_000))
      const [startDate, setStartDate] = useState(startInit.slice(0, 10))
      const [startTime, setStartTime] = useState(startInit.slice(11, 16))
      const [endDate, setEndDate] = useState(endInit.slice(0, 10))
      const [endTime, setEndTime] = useState(endInit.slice(11, 16))
      const [description, setDescription] = useState(initial?.description ?? '')
      const [location, setLocation] = useState(initial?.location ?? '')
      const [lock, setLock] = useState(initial?.lock ?? false)
      const [allDay, setAllDay] = useState(Boolean(initial?.allDay))
      const [lead, setLead] = useState(() => leadToSelect(initial?.remindLead))
      const [error, setError] = useState(null)
      const [conflicts, setConflicts] = useState(null)
      const [confirming, setConfirming] = useState(false)
      const [busy, setBusy] = useState(false)

      const settle = payload => { onSaved(payload); onClose() }

      const save = async allowConflicts => {
        setBusy(true)
        setError(null)
        const input = {
          title,
          category: categoryId(category, categories),
          description,
          location: location.trim() === '' ? null : location,
          lock,
          remindLead: lead === '' ? null : Number(lead),
          // All-day saves carry the day only; the service normalizes the
          // pair into a whole-day interval. `allDay: false` on an all-day
          // row makes the service drop the flag and keep the times below.
          allDay,
          ...(allDay ? { day: startDate } : {}),
          start: zoneLocal(`${startDate}T${startTime}`),
          end: zoneLocal(`${endDate}T${endTime}`),
        }
        try {
          const saved = initial === null
            ? await api.createEntry(input, { allowConflicts })
            : await api.updateEntry(initial.id, input, { allowConflicts })
          if (undoApi !== undefined) {
            if (initial === null) {
              // Re-created rows get fresh ids, so undo/redo must track the
              // live id instead of the id returned by the first save.
              let liveId = saved.id
              undoApi.push({
                label: 'create',
                undo: async () => { await api.deleteEntry(liveId); await refresh() },
                redo: async () => {
                  const created = await api.createEntry((await currentCategoryInputs(api, [input]))[0], { allowConflicts: true })
                  liveId = created.id
                  await refresh()
                },
              })
            } else {
              const before = {
                title: initial.title,
                category: initial.category,
                description: initial.description,
                location: initial.location ?? null,
                lock: initial.lock ?? false,
                remindLead: initial.remindLead ?? null,
                start: initial.start,
                end: initial.end,
              }
              undoApi.push({
                label: 'update',
                undo: async () => { await api.updateEntry(initial.id, (await currentCategoryInputs(api, [before]))[0], { allowConflicts: true }); await refresh() },
                redo: async () => { await api.updateEntry(initial.id, (await currentCategoryInputs(api, [input]))[0], { allowConflicts: true }); await refresh() },
              })
            }
          }
          settle(saved)
        } catch (cause) {
          if (cause.code === 'conflict') setConflicts(cause.details?.conflicts ?? [])
          else setError(cause.message ?? String(cause))
        } finally {
          setBusy(false)
        }
      }

      const remove = async () => {
        setError(null)
        try {
          await api.deleteEntry(initial.id)
          if (undoApi !== undefined) {
            // The re-created row has a new id; redo must delete THAT row.
            let liveId = initial.id
            undoApi.push({
              label: 'delete',
              undo: async () => {
                const [restoredId] = await recreateEntries(api, [{
                  title: initial.title,
                  category: initial.category,
                  description: initial.description,
                  location: initial.location ?? null,
                  lock: initial.lock ?? false,
                  start: initial.start,
                  end: initial.end,
                ...(initial.taskId !== undefined ? { taskId: initial.taskId } : {}),
                ...(initial.allDay !== undefined ? { allDay: initial.allDay } : {}),
                ...(initial.source !== undefined ? { source: initial.source } : {}),
                ...(initial.sourceKey !== undefined ? { sourceKey: initial.sourceKey } : {}),
                ...(initial.remindLead !== undefined ? { remindLead: initial.remindLead } : {}),
                }], refresh, t)
                liveId = restoredId
              },
              redo: async () => { await api.deleteEntry(liveId); await refresh() },
            })
          }
          settle({ deleted: initial.id })
        } catch (cause) {
          setError(cause.message ?? String(cause))
        }
      }

      if (confirming) {
        return h(ConfirmDialog, {
          t, title: t('confirm.deleteTitle'),
          message: t('confirm.deleteEntry').replace('{title}', initial?.title ?? ''),
          confirmLabel: t('confirm.ok'),
          onCancel: () => setConfirming(false),
          onConfirm: () => { setConfirming(false); void remove() },
        })
      }

      // Source-provided entry actions (BUAA's classroom check-in, …) share
      // the footer's right group, ahead of 保存. The slot is owner-typed to
      // the opened entry, so an action can never reach another row by
      // rewriting ids on the client; sources render a footer-sized control.
      const entryActions = initial !== null && typeof renderSlot === 'function'
        ? renderSlot('schedule.entry.actions', { entry: initial })
        : null

      return h(Modal, { title: t(initial === null ? 'entry.create' : 'entry.edit'), onClose },
        conflicts !== null
          ? h('div', { className: 'bsch-error' },
              h('div', null, t('conflict.title')),
              conflicts.map((conflict, i) => h('div', { key: i }, conflict.reason)),
              h('div', { className: 'bsch-modal-actions' },
                h('button', { className: 'bsch-btn', onClick: () => setConflicts(null) }, t('entry.cancel')),
                h('button', { className: 'bsch-btn', onClick: () => { setConflicts(null); void save(true) } }, t('conflict.proceed'))))
          : h('div', null,
              field(t('entry.title'), h('input', {
                className: 'bsch-input', value: title, autoFocus: true,
                onChange: e => setTitle(e.target.value),
              })),
              field(t('entry.category'), h(Select, {
                value: categoryId(category, categories),
                ariaLabel: t('entry.category'),
                options: categories.map(cat => ({ value: cat.id, label: cat.name, color: cat.color })),
                onChange: setCategory,
              })),
              field(t('entry.allDay'), h('input', {
                type: 'checkbox', className: 'bsch-check', checked: allDay,
                onChange: e => setAllDay(e.target.checked),
              })),
              field(t('entry.start'), h('div', { className: 'bsch-rowline' },
                h(DateField, { t, value: startDate, onChange: setStartDate, ariaLabel: t('entry.start') }),
                allDay ? null : h(TimeField, { value: startTime, onChange: setStartTime, ariaLabel: t('entry.start') }))),
              field(t('entry.end'), h('div', { className: 'bsch-rowline' },
                h(DateField, { t, value: endDate, onChange: setEndDate, ariaLabel: t('entry.end') }),
                allDay ? null : h(TimeField, { value: endTime, onChange: setEndTime, ariaLabel: t('entry.end') }))),
              entryDetails({ t, location, setLocation, lock, setLock }),
              h(RemindLeadField, { t, lead, setLead }),
              field(t('entry.description'), h('textarea', {
                className: 'bsch-textarea', value: description, rows: 2,
                onChange: e => setDescription(e.target.value),
              })),
              error !== null ? h('div', { className: 'bsch-error' }, error) : null,
              h('div', { className: 'bsch-modal-actions' },
                h('div', { className: 'bsch-modal-actions-group' },
                  initial !== null ? h('button', {
                    className: 'bsch-btn is-danger',
                    onClick: () => setConfirming(true),
                  }, t('entry.delete')) : null,
                  h('button', { className: 'bsch-btn', onClick: onClose }, t('entry.cancel'))),
                h('span', { className: 'bsch-spacer' }),
                entryActions,
                h('button', {
                  className: 'bsch-btn is-primary', disabled: busy || title.trim() === '',
                  onClick: () => void save(false),
                }, t('entry.save')))))
    }

    // The same entry details are available for single and batch creation.
    function entryDetails({ t, location, setLocation, lock, setLock }) {
      return h(React.Fragment, null,
        field(t('entry.location'), h('input', {
          className: 'bsch-input', value: location,
          onChange: event => setLocation(event.target.value),
        })),
        h('button', {
          className: 'bsch-lock-switch', type: 'button', role: 'switch',
          'aria-checked': lock, 'aria-label': t('entry.lock'),
          onClick: () => setLock(value => !value),
          onKeyDown: event => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault() // suppress the native synthesized click
            if (!event.repeat) setLock(value => !value)
          },
        }, h('span', { className: 'bsch-switch-track', 'aria-hidden': true },
          h('span', { className: 'bsch-switch-thumb' })), t('entry.lock')))
    }

    // -- per-row reminder override (docs/14 §4): '' follows the global tiers --
    const REMIND_PRESETS = [0, 15, 30, 60, 120, 1440, 2880]

    const labelForLead = (t, minutes) => {
      if (minutes === 0) return t('remind.atTime')
      if (minutes % 1440 === 0) return t('remind.daysBefore').replace('{n}', String(minutes / 1440))
      return t('remind.minutesBefore').replace('{n}', String(minutes))
    }

    /** Preset options plus the current value when it is off-menu (agent-set). */
    function leadOptions(t, current) {
      const values = [...REMIND_PRESETS]
      if (current !== null && current !== undefined && !values.includes(current)) values.push(current)
      values.sort((a, b) => a - b)
      return [
        { value: '', label: t('remind.default') },
        ...values.map(value => ({ value: String(value), label: labelForLead(t, value) })),
      ]
    }

    function RemindLeadField({ t, lead, setLead }) {
      return field(t('remind.lead'), h(Select, {
        value: lead, ariaLabel: t('remind.lead'),
        options: leadOptions(t, lead === '' ? null : Number(lead)),
        onChange: setLead,
      }))
    }

    const leadToSelect = lead => (lead === null || lead === undefined ? '' : String(lead))

    /** `datetime-local` values are browser-local wall times; emit them
     *  with the browser's explicit offset so the wire format is honest. */
    const zoneLocal = value => core.dateToZonedIso(new Date(value))

    // -- batch create (legacy BatchAddModal 批量新建日程) -----------------------
    const DAY_MS = 86_400_000
    const BATCH_DEFAULT_DAYS = [1, 2, 3, 4, 5] // Mon..Fri

    function BatchEditor({ t, api, undoApi, refresh, onClose, categories: configuredCategories }) {
      const categories = categoriesOrDefault(configuredCategories)
      const [title, setTitle] = useState('')
      const [repeat, setRepeat] = useState('daily')
      const [weekdays, setWeekdays] = useState(BATCH_DEFAULT_DAYS)
      const [startDate, setStartDate] = useState(dateKey(new Date()))
      const [endDate, setEndDate] = useState(dateKey(new Date(Date.now() + 7 * DAY_MS)))
      const [startTime, setStartTime] = useState('09:00')
      const [endTime, setEndTime] = useState('10:00')
      const [category, setCategory] = useState('other')
      const [description, setDescription] = useState('')
      const [location, setLocation] = useState('')
      const [lock, setLock] = useState(false)
      const [error, setError] = useState(null)
      const [summary, setSummary] = useState(null)
      const [busy, setBusy] = useState(false)

      // The exact days the batch will land on, for the live count preview.
      const targetDays = useMemo(() => {
        const days = []
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return days
        if (endDate < startDate) return days
        let cursor = new Date(startDate + 'T12:00:00')
        const stop = new Date(endDate + 'T12:00:00')
        while (cursor <= stop) {
          const key = dateKey(cursor)
          if (repeat === 'daily' || weekdays.includes(gridm.dayOfWeek(key))) days.push(key)
          cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, 12)
        }
        return days
      }, [startDate, endDate, repeat, weekdays])

      const toggleDay = value => setWeekdays(prev => prev.includes(value)
        ? prev.filter(day => day !== value)
        : [...prev, value].sort((a, b) => a - b))

      const submit = async () => {
        if (targetDays.length === 0) { setError(t('batch.emptyRange')); return }
        if (endTime <= startTime) { setError(t('batch.badRange')); return }
        setBusy(true)
        setError(null)
        const inputs = targetDays.map(day => ({
          title,
          category: categoryId(category, categories),
          description,
          location: location.trim() === '' ? null : location,
          lock,
          start: zoneLocal(`${day}T${startTime}`),
          end: zoneLocal(`${day}T${endTime}`),
        }))
        try {
          // The legacy batch wrote past conflicts silently; keep that
          // behavior (a daily 09:00 slot can legitimately overlap other entries).
          const results = await api.batchCreateEntries(inputs, { allowConflicts: true })
          const okIds = results.filter(row => row.ok).map(row => row.id)
          const ok = okIds.length
          const fail = results.length - ok
          if (ok > 0 && undoApi !== undefined) {
            let liveIds = okIds
            const accepted = inputs.filter((_, i) => results[i].ok)
            undoApi.push({
              label: 'batch-create',
              undo: async () => {
                await api.deleteEntry(liveIds)
                await refresh()
              },
              redo: async () => {
                liveIds = await recreateEntries(api, accepted, refresh, t)
              },
            })
          }
          await refresh()
          if (fail === 0) onClose()
          else setSummary({ ok, fail })
        } catch (cause) {
          setError(cause.message ?? String(cause))
        } finally {
          setBusy(false)
        }
      }

      return h(Modal, { title: t('batch.title'), onClose },
        h('div', null,
          field(t('entry.title'), h('input', {
            className: 'bsch-input', value: title, autoFocus: true,
            onChange: e => setTitle(e.target.value),
          })),
          field(t('batch.repeat'), h('select', {
            className: 'bsch-select', value: repeat,
            onChange: e => setRepeat(e.target.value),
          }, [
            h('option', { key: 'daily', value: 'daily' }, t('batch.daily')),
            h('option', { key: 'weekly', value: 'weekly' }, t('batch.weekly')),
          ])),
          repeat === 'weekly' ? field(t('batch.weekdays'), h('div', { className: 'bsch-weekdays' },
            gridm.WEEKDAY_LABELS.map((label, i) => {
              const value = i + 1
              return h('label', { key: value, className: 'bsch-weekday' },
                h('input', {
                  type: 'checkbox', checked: weekdays.includes(value),
                  onChange: () => toggleDay(value),
                }), label)
            }))) : null,
          h('div', { className: 'bsch-rowline' },
            field(t('batch.startDate'), h(DateField, {
              t, value: startDate, onChange: setStartDate, ariaLabel: t('batch.startDate'),
            })),
            field(t('batch.endDate'), h(DateField, {
              t, value: endDate, onChange: setEndDate, ariaLabel: t('batch.endDate'),
            }))),
          h('div', { className: 'bsch-rowline' },
            field(t('batch.startTime'), h(TimeField, {
              value: startTime, onChange: setStartTime, ariaLabel: t('batch.startTime'),
            })),
            field(t('batch.endTime'), h(TimeField, {
              value: endTime, onChange: setEndTime, ariaLabel: t('batch.endTime'),
            }))),
          field(t('entry.category'), h(Select, {
            value: categoryId(category, categories),
            ariaLabel: t('entry.category'),
            options: categories.map(cat => ({ value: cat.id, label: cat.name, color: cat.color })),
            onChange: setCategory,
          })),
          entryDetails({ t, location, setLocation, lock, setLock }),
          field(t('entry.description'), h('textarea', {
            className: 'bsch-textarea', value: description, rows: 2,
            onChange: e => setDescription(e.target.value),
          })),
          h('div', { className: 'bsch-hint' },
            t('batch.count').replace('{count}', String(targetDays.length))),
          summary !== null
            ? h('div', { className: 'bsch-hint' },
                t('batch.created').replace('{ok}', String(summary.ok)).replace('{fail}', String(summary.fail)))
            : null,
          error !== null ? h('div', { className: 'bsch-error' }, error) : null,
          h('div', { className: 'bsch-modal-actions' },
            h('button', { className: 'bsch-btn', onClick: onClose }, t('entry.cancel')),
            h('button', {
              className: 'bsch-btn is-primary',
              disabled: busy || title.trim() === '' || targetDays.length === 0,
              onClick: () => void submit(),
            }, busy ? t('batch.creating') : t('batch.create')))))
    }

    return { EventEditor, BatchEditor, zoneLocal, toLocalInput, RemindLeadField, leadToSelect }
  },
})
