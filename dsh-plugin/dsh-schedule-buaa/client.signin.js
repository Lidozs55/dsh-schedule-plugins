/**
 * BUAA entry action: remote classroom check-in on today's teaching entries.
 *
 * The core declares `schedule.entry.actions` and renders it inside the entry
 * editor with `{ entry }` as owner props. This chunk registers one action for
 * entries created by the BUAA source. It deliberately does not decide which
 * iclass row to sign: the host looks the entry up, matches today's iclass rows
 * by course name + time, and only then submits. A stale or forged entry id
 * therefore cannot point the button at an arbitrary course.
 */
window.__ModuleLoader__.load({
  id: '@buaaer/dsh-schedule-buaa/client.signin.js',
  factory: (require) => {
    const React = require('react')
    const { useState, useEffect, useRef } = React
    const h = React.createElement
    const api = require('@buaaer/dsh-schedule-buaa/client.api.js')
    // Core-bundle UI (the toast stack for results, the top-layer tip for the
    // hover hint). The core materializes these chunks inside its apply, so the
    // sync `require`s below only see them because the entry injects the core's
    // `scheduleShared` service — cordis holds this bundle's fiber pending
    // until that apply finished.
    const { toast } = require('@lidozs55/dsh-schedule/client.notify.js')
    const { showTip, hideTip } = require('@lidozs55/dsh-schedule/client.core.js')

    const zh = {
      'signin.action': '签到',
      'signin.busy': '签到中…',
      'signin.hint': '仅当天北航课程可签到，结果以学校系统为准；需先在日程设置中导入一次。',
      'signin.success': '签到成功',
      'signin.failed': '签到失败',
    }

    const en = {
      'signin.action': 'Check in',
      'signin.busy': 'Checking in…',
      'signin.hint': "Today's BUAA courses only; import once in Schedule settings first. The school system is authoritative.",
      'signin.success': 'Checked in',
      'signin.failed': 'Check-in failed',
    }

    // Hover intent: ~1 s on the button, immediate on keyboard focus.
    let tipTimer = null
    const cancelTip = () => {
      if (tipTimer !== null) { clearTimeout(tipTimer); tipTimer = null }
      hideTip()
    }
    const armTip = (anchor, text, delay) => {
      cancelTip()
      tipTimer = setTimeout(() => showTip(anchor, text), delay)
    }

    const dateFormat = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    })

    const chinaDateKey = value => {
      const date = value instanceof Date ? value : new Date(value)
      if (!Number.isFinite(date.getTime())) return ''
      const parts = {}
      for (const part of dateFormat.formatToParts(date)) parts[part.type] = part.value
      return `${parts.year}-${parts.month}-${parts.day}`
    }

    /** Only today's BUAA teaching entries can check in; other sources are untouched. */
    const canCheckin = entry => entry !== null && typeof entry === 'object'
      && entry.source === 'buaa'
      && typeof entry.sourceKey === 'string'
      && entry.sourceKey.startsWith('teaching:')
      && chinaDateKey(entry.start) !== ''
      && chinaDateKey(entry.start) === chinaDateKey(new Date())

    function SigninAction(props) {
      const { t, entry } = props
      const [busy, setBusy] = useState(false)
      const btnRef = useRef(null)

      // Hover the button for a second to see how check-in works; keyboard
      // focus shows the same text immediately.
      useEffect(() => {
        const el = btnRef.current
        if (el === null) return undefined
        const enter = () => armTip(el, t('signin.hint'), 1000)
        const focus = () => showTip(el, t('signin.hint'))
        const leave = () => cancelTip()
        el.addEventListener('pointerenter', enter)
        el.addEventListener('pointerleave', leave)
        el.addEventListener('focusin', focus)
        el.addEventListener('focusout', leave)
        return () => {
          el.removeEventListener('pointerenter', enter)
          el.removeEventListener('pointerleave', leave)
          el.removeEventListener('focusin', focus)
          el.removeEventListener('focusout', leave)
          cancelTip()
        }
      }, [t])

      if (!canCheckin(entry)) return null

      const submit = async () => {
        setBusy(true)
        cancelTip()
        try {
          const result = await api.signin(entry.id)
          const ok = result?.success !== false
          toast(t(ok ? 'signin.success' : 'signin.failed'), result?.message ?? '', 6000)
        } catch (cause) {
          toast(t('signin.failed'), cause.message ?? String(cause), 6000)
        } finally {
          setBusy(false)
        }
      }

      // Footer-sized control: the core places this button in the entry
      // editor's action row, between the spacer and 保存.
      return h('button', {
        ref: btnRef, className: 'bsch-btn', type: 'button', disabled: busy,
        onClick: () => void submit(),
      }, busy ? t('signin.busy') : t('signin.action'))
    }

    return { SigninAction, canCheckin, chinaDateKey, zh, en }
  },
})
