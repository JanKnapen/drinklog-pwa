import { useState, useEffect, useMemo } from 'react';
import { setToken, clearToken } from '../api/client';
import { fetchUserTemplates, postImport } from '../api/client';
import type { ImportSession, TemplateOption, DrinkMapping, Module } from '../types';
import AdminHeader from '../components/AdminHeader';

function fmtNum(n: number | undefined): string {
  if (n === undefined) return '?';
  return n % 1 === 0 ? String(n) : parseFloat(n.toFixed(2)).toString();
}

function templateInfo(t: TemplateOption, module: Module): string {
  if (module === 'alcohol') return `${fmtNum(t.default_ml)}ml · ${fmtNum(t.default_abv)}%`;
  return `${fmtNum(t.default_mg)}mg`;
}

const IMPORT_SESSION_KEY = 'drinklog-import-session';

interface MappingState {
  mode: 'existing' | 'new';
  templateId: string;
  search: string;
  ml: string;
  abv: string;
  mg: string;
  mlError: string;
  abvError: string;
  mgError: string;
}

function initMapping(name: string, templates: TemplateOption[]): MappingState {
  const match = templates.find(t => t.name.toLowerCase() === name.toLowerCase());
  return {
    mode: match ? 'existing' : 'new',
    templateId: match?.id ?? '',
    search: '',
    ml: '',
    abv: '',
    mg: '',
    mlError: '',
    abvError: '',
    mgError: '',
  };
}

function validateMappings(
  uniqueNames: string[],
  mappings: Record<string, MappingState>,
  module: Module,
): boolean {
  for (const name of uniqueNames) {
    const m = mappings[name];
    if (!m) return false;
    if (m.mode === 'existing') {
      if (!m.templateId) return false;
    } else {
      if (module === 'alcohol') {
        if (!m.ml || parseFloat(m.ml) <= 0) return false;
        if (m.abv === '' || parseFloat(m.abv) < 0 || parseFloat(m.abv) > 100) return false;
      } else {
        if (!m.mg || parseFloat(m.mg) <= 0) return false;
      }
    }
  }
  return true;
}

function entryCountForName(name: string, rawEntries: { name?: string; count?: number }[]): number {
  return rawEntries
    .filter(e => e.name === name)
    .reduce((sum, e) => sum + (e.count ?? 1), 0);
}

export default function ImportReviewView() {
  const [session, setSession] = useState<ImportSession | null>(null);
  const [noSession, setNoSession] = useState(false);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [mappings, setMappings] = useState<Record<string, MappingState>>({});
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<'cancel' | 'import' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [inserted, setInserted] = useState<number | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(IMPORT_SESSION_KEY);
    if (!raw) { setNoSession(true); return; }
    localStorage.removeItem(IMPORT_SESSION_KEY);
    try {
      const parsed: ImportSession = JSON.parse(raw);
      setToken(parsed.token);
      setSession(parsed);
    } catch {
      setNoSession(true);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    setLoadingTemplates(true);
    fetchUserTemplates(session.userId, session.module)
      .then(t => {
        setTemplates(t);
        const uniqueNames = [...new Set(session.rawEntries.filter(e => e.name).map(e => e.name as string))];
        const initial: Record<string, MappingState> = {};
        for (const name of uniqueNames) {
          initial[name] = initMapping(name, t);
        }
        setMappings(initial);
      })
      .catch(() => {})
      .finally(() => setLoadingTemplates(false));
  }, [session]);

  // Close open dropdown when clicking outside — no backdrop div needed
  useEffect(() => {
    if (openDropdown === null) return;
    function handleOutsideClick() { setOpenDropdown(null); }
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [openDropdown]);

  const namedEntries = useMemo(
    () => (session ? session.rawEntries.filter(e => e.name) : []),
    [session],
  );

  const anonEntries = useMemo(
    () => (session ? session.rawEntries.filter(e => !e.name) : []),
    [session],
  );

  const uniqueNames = useMemo(
    () => [...new Set(namedEntries.map(e => e.name as string))],
    [namedEntries],
  );

  const totalEntries = useMemo(
    () => (session ? session.rawEntries.reduce((s, e) => s + (e.count ?? 1), 0) : 0),
    [session],
  );

  const anonCount = useMemo(
    () => anonEntries.reduce((s, e) => s + (e.count ?? 1), 0),
    [anonEntries],
  );

  function updateMapping(name: string, patch: Partial<MappingState>) {
    setMappings(prev => ({ ...prev, [name]: { ...prev[name], ...patch } }));
  }

  function validateField(name: string, field: 'ml' | 'abv' | 'mg', value: string) {
    const num = parseFloat(value);
    let error = '';
    if (field === 'ml') error = !value || num <= 0 ? 'Must be greater than 0' : '';
    if (field === 'abv') error = value === '' || num < 0 || num > 100 ? 'Must be 0–100' : '';
    if (field === 'mg') error = !value || num <= 0 ? 'Must be greater than 0' : '';
    const errorKey = `${field}Error` as 'mlError' | 'abvError' | 'mgError';
    updateMapping(name, { [field]: value, [errorKey]: error });
  }

  function runValidation(name: string) {
    const m = mappings[name];
    if (!m || m.mode !== 'new' || !session) return;
    if (session.module === 'alcohol') {
      const mlError = !m.ml || parseFloat(m.ml) <= 0 ? 'Must be greater than 0' : '';
      const abvError = m.abv === '' || parseFloat(m.abv) < 0 || parseFloat(m.abv) > 100 ? 'Must be 0–100' : '';
      updateMapping(name, { mlError, abvError });
    } else {
      const mgError = !m.mg || parseFloat(m.mg) <= 0 ? 'Must be greater than 0' : '';
      updateMapping(name, { mgError });
    }
  }

  const canConfirm = useMemo(
    () => !loadingTemplates && session !== null && validateMappings(uniqueNames, mappings, session.module),
    [loadingTemplates, session, uniqueNames, mappings],
  );

  async function doImport() {
    if (!session) return;
    for (const name of uniqueNames) runValidation(name);
    if (!validateMappings(uniqueNames, mappings, session.module)) return;

    const builtMappings: DrinkMapping[] = uniqueNames.map(name => {
      const m = mappings[name];
      if (m.mode === 'existing') {
        return { drink_name: name, mode: 'existing', template_id: m.templateId };
      }
      if (session.module === 'alcohol') {
        return { drink_name: name, mode: 'new', ml: parseFloat(m.ml), abv: parseFloat(m.abv) };
      }
      return { drink_name: name, mode: 'new', mg: parseFloat(m.mg) };
    });

    setConfirmation(null);
    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await postImport(session.userId, {
        module: session.module,
        mappings: builtMappings,
        entries: session.rawEntries,
      });
      setInserted(result.inserted);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Import failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleLogout() {
    clearToken();
    window.location.href = '/';
  }

  if (noSession) {
    return (
      <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950 overflow-hidden">
        <AdminHeader onLogout={handleLogout} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8">
            <p className="text-gray-600 dark:text-gray-400 mb-4">No import session found. Please start the import from the admin page.</p>
            <button onClick={() => window.location.href = '/'} className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">Go to admin</button>
          </div>
        </div>
      </div>
    );
  }

  if (!session || loadingTemplates) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <p className="text-gray-500 dark:text-gray-400">Loading…</p>
      </div>
    );
  }

  if (inserted !== null) {
    return (
      <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950 overflow-hidden">
        <AdminHeader onLogout={handleLogout} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8">
            <div className="text-green-600 dark:text-green-400 text-4xl mb-4">✓</div>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{inserted} entries imported</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Successfully imported for <strong>{session.username}</strong> ({session.module}).
            </p>
            <button onClick={() => window.location.href = '/'} className="text-sm bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700">
              Back to admin
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950 overflow-hidden">
      {/* Confirmation modals */}
      {confirmation === 'cancel' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">Cancel import?</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">All mappings will be lost.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmation(null)} className="text-sm text-gray-600 dark:text-gray-400 px-4 py-2">Keep editing</button>
              <button onClick={() => window.location.href = '/'} className="text-sm bg-red-600 text-white rounded-md px-4 py-2 hover:bg-red-700">
                Cancel import
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmation === 'import' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">Confirm import?</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              This will add <strong>{totalEntries}</strong> {totalEntries === 1 ? 'entry' : 'entries'} for <strong>{session.username}</strong>.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmation(null)} className="text-sm text-gray-600 dark:text-gray-400 px-4 py-2">Back</button>
              <button onClick={doImport} className="text-sm bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700">
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <AdminHeader onLogout={handleLogout} />

      {/* Info strip */}
      <div className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-2 shrink-0">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Importing for <strong className="text-gray-700 dark:text-gray-300">{session.username}</strong>
          {' · '}{session.module}
          {' · '}{totalEntries} {totalEntries === 1 ? 'entry' : 'entries'}
          {uniqueNames.length > 0 && <>{' · '}{uniqueNames.length} unique {uniqueNames.length === 1 ? 'drink' : 'drinks'}</>}
          {anonCount > 0 && <>{' · '}{anonCount} anonymous</>}
        </p>
      </div>

      {/* Scrollable cards */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">
          {anonEntries.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Anonymous entries</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {anonCount} {anonCount === 1 ? 'entry' : 'entries'} · imported directly, no template
                  </p>
                </div>
                <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-1 rounded">Auto</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">
                      <th className="text-left font-medium pb-1.5">Date / Time</th>
                      {session.module === 'alcohol' ? (
                        <>
                          <th className="text-right font-medium pb-1.5">ml</th>
                          <th className="text-right font-medium pb-1.5">ABV %</th>
                        </>
                      ) : (
                        <th className="text-right font-medium pb-1.5">mg</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                    {anonEntries.slice(0, 100).map((e, i) => (
                      <tr key={i} className="text-gray-600 dark:text-gray-400">
                        <td className="py-1">{e.timestamp ?? e.date}</td>
                        {session.module === 'alcohol' ? (
                          <>
                            <td className="text-right py-1">{e.ml}</td>
                            <td className="text-right py-1">{e.abv}</td>
                          </>
                        ) : (
                          <td className="text-right py-1">{e.mg}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {anonEntries.length > 100 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">…and {anonEntries.length - 100} more</p>
                )}
              </div>
            </div>
          )}
          {uniqueNames.map(name => {
            const m = mappings[name];
            if (!m) return null;
            const isOpen = openDropdown === name;
            const count = entryCountForName(name, session.rawEntries);
            const selectedTemplate = templates.find(t => t.id === m.templateId);
            const filtered = templates.filter(t =>
              m.search === '' || t.name.toLowerCase().includes(m.search.toLowerCase()),
            );
            return (
              <div key={name} className={`bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 ${isOpen ? 'relative z-20' : ''}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{count} {count === 1 ? 'entry' : 'entries'}</p>
                  </div>
                  <div className="inline-flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden text-xs ml-4 shrink-0">
                    <button
                      type="button"
                      onClick={() => { updateMapping(name, { mode: 'existing' }); setOpenDropdown(null); }}
                      className={`px-3 py-1.5 ${m.mode === 'existing' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                    >
                      Existing
                    </button>
                    <button
                      type="button"
                      onClick={() => { updateMapping(name, { mode: 'new' }); setOpenDropdown(null); }}
                      className={`px-3 py-1.5 border-l border-gray-300 dark:border-gray-600 ${m.mode === 'new' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                    >
                      New
                    </button>
                  </div>
                </div>

                {m.mode === 'existing' ? (
                  <div className="relative">
                    {templates.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500 italic">No existing templates — switch to "New".</p>
                    ) : (
                      <>
                        {/* Trigger — stopPropagation so the document listener doesn't immediately close it */}
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setOpenDropdown(isOpen ? null : name); }}
                          className="w-full text-left border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm flex items-center justify-between bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          {selectedTemplate ? (
                            <span className="flex items-baseline gap-2 min-w-0">
                              <span className="text-gray-900 dark:text-gray-100 truncate">{selectedTemplate.name}</span>
                              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{templateInfo(selectedTemplate, session.module)}</span>
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500">None selected</span>
                          )}
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 shrink-0 ml-2" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                        {/* Overlay dropdown — stopPropagation so clicks inside don't close it */}
                        {isOpen && (
                          <div
                            className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-10"
                            onClick={e => e.stopPropagation()}
                          >
                            <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                              <input
                                type="text"
                                placeholder="Search templates…"
                                value={m.search}
                                onChange={e => updateMapping(name, { search: e.target.value })}
                                autoFocus
                                className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                              {filtered.length === 0 ? (
                                <p className="text-sm text-gray-400 dark:text-gray-500 px-3 py-2">No matches</p>
                              ) : filtered.map(t => (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => { updateMapping(name, { templateId: t.id, search: '' }); setOpenDropdown(null); }}
                                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 ${m.templateId === t.id ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium' : 'text-gray-700 dark:text-gray-300'}`}
                                >
                                  <span className="truncate">{t.name}</span>
                                  <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 ml-3">{templateInfo(t, session.module)}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {!m.templateId && !isOpen && (
                          <p className="text-xs text-red-500 mt-1">Select a template.</p>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {session.module === 'alcohol' ? (
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Volume (ml)</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={m.ml}
                            onChange={e => validateField(name, 'ml', e.target.value)}
                            onBlur={() => runValidation(name)}
                            placeholder="e.g. 330"
                            className={`w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 ${m.mlError ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'}`}
                          />
                          {m.mlError && <p className="text-xs text-red-500 mt-1">{m.mlError}</p>}
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">ABV (%)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="any"
                            value={m.abv}
                            onChange={e => validateField(name, 'abv', e.target.value)}
                            onBlur={() => runValidation(name)}
                            placeholder="e.g. 5"
                            className={`w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 ${m.abvError ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'}`}
                          />
                          {m.abvError && <p className="text-xs text-red-500 mt-1">{m.abvError}</p>}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Caffeine (mg)</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={m.mg}
                          onChange={e => validateField(name, 'mg', e.target.value)}
                          onBlur={() => runValidation(name)}
                          placeholder="e.g. 80"
                          className={`w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 ${m.mgError ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'}`}
                        />
                        {m.mgError && <p className="text-xs text-red-500 mt-1">{m.mgError}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <div className="shrink-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-4 sm:px-6 pt-4 pb-safe">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          {submitError ? (
            <p className="text-sm text-red-600 dark:text-red-400 flex-1">{submitError}</p>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 flex-1">
              {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'} ready to import
            </p>
          )}
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmation('cancel')}
              className="text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-md px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setConfirmation('import')}
              disabled={!canConfirm || submitting}
              className="text-sm bg-blue-600 text-white rounded-md px-6 py-2 hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Importing…' : 'Confirm import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
