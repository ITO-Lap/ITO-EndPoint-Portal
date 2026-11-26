import { useCallback, useEffect, useRef, useState } from 'react'
import { settingsApi, type SettingsSectionName } from '../api/settings'
import { useToast } from '../components/ui/toastHooks'

/**
 * Loads a Settings section's saved values once (handing them to `apply`) and saves it on request.
 * `meta` says who saved it last and when, so the page shows real state, not a pretend "Saved".
 */
export function useSavedSettings(section: SettingsSectionName, apply: (values: Record<string, unknown>) => void) {
  const { notify } = useToast()
  const applyRef = useRef(apply)
  useEffect(() => { applyRef.current = apply })
  const [meta, setMeta] = useState<{ updatedBy: string | null; updatedAt: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void settingsApi.load().then(all => {
      const saved = all[section]
      if (cancelled || !saved) return
      applyRef.current(saved.values)
      setMeta({ updatedBy: saved.updatedBy, updatedAt: saved.updatedAt })
    }).catch(() => undefined) // not loaded: the defaults stay and saving still works
    return () => { cancelled = true }
  }, [section])

  const save = useCallback(async (values: Record<string, unknown>) => {
    setSaving(true)
    try {
      const saved = await settingsApi.save(section, values)
      setMeta({ updatedBy: saved.updatedBy, updatedAt: saved.updatedAt })
      notify('success', 'Saved', 'Your changes were saved on the server.')
    } catch (e) {
      notify('error', 'Not saved', e instanceof Error ? e.message : 'Could not save the settings.')
    } finally {
      setSaving(false)
    }
  }, [section, notify])

  return { save, saving, meta }
}

export const savedNote = (meta: { updatedBy: string | null; updatedAt: string } | null): string | undefined =>
  meta ? `Last saved ${new Date(meta.updatedAt).toLocaleString()}${meta.updatedBy ? ` by ${meta.updatedBy}` : ''}` : undefined
