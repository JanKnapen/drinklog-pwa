import { useState, useEffect, useMemo } from 'react';
import { setToken, clearToken } from '../api/client';
import { fetchUserTemplates, postImport } from '../api/client';
import type { ImportSession, TemplateOption, DrinkMapping, Module } from '../types';

const IMPORT_SESSION_KEY = 'drinklog-import-session';

interface MappingState {
  mode: 'existing' | 'new';
  templateId: string;
  search: string;
  dropdownOpen: boolean;
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
    dropdownOpen: false,
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

function entryCountForName(name: string, rawEntries: { name: string; count?: number }[]): number {
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
        const uniqueNames = [...new Set(session.rawEntries.map(e => e.name))];
        const initial: Record<string, MappingState> = {};
        for (const name of uniqueNames) {
          initial[name] = initMapping(name, t);
        }
        setMappings(initial);
      })
      .catch(() => {})
      .finally(() => setLoadingTemplates(false));
  }, [session]);

  const uniqueNames = useMemo(
    () => (session ? [...new Set(session.rawEntries.map(e => e.name))] : []),
    [session],
  );

  const totalEntries = useMemo(
    () => (session ? session.rawEntries.reduce((s, e) => s + (e.count ?? 1), 0) : 0),
    [session],
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

  async function handleConfirm() {
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
      <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between shrink-0">
          <h1 className="text-xl font-semibold text-gray-900">DrinkLog Admin</h1>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-700">Log out</button>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8">
            <p className="text-gray-600 mb-4">No import session found. Please start the import from the admin page.</p>
            <button onClick={() => window.location.href = '/'} className="text-sm text-blue-600 hover:text-blue-800">Go to admin</button>
          </div>
        </div>
      </div>
    );
  }

  if (!session || loadingTemplates) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  if (inserted !== null) {
    return (
      <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between shrink-0">
          <h1 className="text-xl font-semibold text-gray-900">DrinkLog Admin</h1>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-700">Log out</button>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8">
            <div className="text-green-600 text-4xl mb-4">✓</div>
            <p className="text-lg font-semibold text-gray-900 mb-2">{inserted} entries imported</p>
            <p className="text-sm text-gray-500 mb-6">
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
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      {/* Header — same as main admin */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between shrink-0">
        <h1 className="text-xl font-semibold text-gray-900">DrinkLog Admin</h1>
        <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-700">Log out</button>
      </header>

      {/* Info strip — stays visible while scrolling */}
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-2 shrink-0">
        <p className="text-sm text-gray-500">
          Importing for <strong className="text-gray-700">{session.username}</strong>
          {' · '}{session.module}
          {' · '}{totalEntries} {totalEntries === 1 ? 'entry' : 'entries'}
          {' · '}{uniqueNames.length} unique {uniqueNames.length === 1 ? 'drink' : 'drinks'}
        </p>
      </div>

      {/* Scrollable cards */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">
          {uniqueNames.map(name => {
            const m = mappings[name];
            if (!m) return null;
            const count = entryCountForName(name, session.rawEntries);
            const selectedTemplate = templates.find(t => t.id === m.templateId);
            const filtered = templates.filter(t =>
              m.search === '' || t.name.toLowerCase().includes(m.search.toLowerCase()),
            );
            return (
              <div key={name} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium text-gray-900">{name}</p>
                    <p className="text-xs text-gray-500">{count} {count === 1 ? 'entry' : 'entries'}</p>
                  </div>
                  <div className="inline-flex rounded border border-gray-300 overflow-hidden text-xs ml-4 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateMapping(name, { mode: 'existing', dropdownOpen: false })}
                      className={`px-3 py-1.5 ${m.mode === 'existing' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                    >
                      Existing
                    </button>
                    <button
                      type="button"
                      onClick={() => updateMapping(name, { mode: 'new', dropdownOpen: false })}
                      className={`px-3 py-1.5 border-l border-gray-300 ${m.mode === 'new' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                    >
                      New
                    </button>
                  </div>
                </div>

                {m.mode === 'existing' ? (
                  <div>
                    {templates.length === 0 ? (
                      <p className="text-sm text-gray-400 italic">No existing templates — switch to "New".</p>
                    ) : m.dropdownOpen ? (
                      <div>
                        <input
                          type="text"
                          placeholder="Search templates…"
                          value={m.search}
                          onChange={e => updateMapping(name, { search: e.target.value })}
                          autoFocus
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="max-h-40 overflow-y-auto rounded border border-gray-200 divide-y divide-gray-100">
                          {filtered.length === 0 ? (
                            <p className="text-sm text-gray-400 px-3 py-2">No matches</p>
                          ) : filtered.map(t => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => updateMapping(name, { templateId: t.id, dropdownOpen: false, search: '' })}
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${m.templateId === t.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
                            >
                              {t.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <button
                          type="button"
                          onClick={() => updateMapping(name, { dropdownOpen: true })}
                          className="w-full text-left border border-gray-300 rounded-md px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-50"
                        >
                          <span className={selectedTemplate ? 'text-gray-900' : 'text-gray-400'}>
                            {selectedTemplate ? selectedTemplate.name : 'None selected'}
                          </span>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                        {!m.templateId && (
                          <p className="text-xs text-red-500 mt-1">Select a template.</p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {session.module === 'alcohol' ? (
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Volume (ml)</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={m.ml}
                            onChange={e => validateField(name, 'ml', e.target.value)}
                            onBlur={() => runValidation(name)}
                            placeholder="e.g. 330"
                            className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${m.mlError ? 'border-red-400' : 'border-gray-300'}`}
                          />
                          {m.mlError && <p className="text-xs text-red-500 mt-1">{m.mlError}</p>}
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">ABV (%)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="any"
                            value={m.abv}
                            onChange={e => validateField(name, 'abv', e.target.value)}
                            onBlur={() => runValidation(name)}
                            placeholder="e.g. 5"
                            className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${m.abvError ? 'border-red-400' : 'border-gray-300'}`}
                          />
                          {m.abvError && <p className="text-xs text-red-500 mt-1">{m.abvError}</p>}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Caffeine (mg)</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={m.mg}
                          onChange={e => validateField(name, 'mg', e.target.value)}
                          onBlur={() => runValidation(name)}
                          placeholder="e.g. 80"
                          className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${m.mgError ? 'border-red-400' : 'border-gray-300'}`}
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
      <div className="shrink-0 bg-white border-t border-gray-200 px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          {submitError ? (
            <p className="text-sm text-red-600 flex-1">{submitError}</p>
          ) : (
            <p className="text-sm text-gray-500 flex-1">
              {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'} ready to import
            </p>
          )}
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => window.location.href = '/'}
              className="text-sm text-gray-600 border border-gray-300 rounded-md px-4 py-2 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
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
