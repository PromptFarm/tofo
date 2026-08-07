# Project Creation — аудит алгоритма

## Полный алгоритм (рабочий путь — через модалку)

```
/tofo/projects
  → [кнопка "New Project"]
  → CreateProjectModal открывается (ProjectsPageClient.tsx:192)

handleLaunch():
  1. POST /api/projects/draft          → создаёт проект со статусом "draft"
  2. PATCH /api/projects/{id}/name     → (если заполнено вручную)
  3. PATCH /api/projects/{id}          → (если уже есть draft — обновляет idea/team/tags)
  4. POST /api/projects/name           → AI-генерация имени (если пустое)
  5. PATCH /api/projects/{id}/name     → сохраняет AI-имя
  6. POST /api/thinking-graph/session  → fetchThinkingGraphSession() — создаёт сессию
  7. PUT  /api/projects/{id}/session   → saveProjectThinkingGraphSession()
  8. PATCH /api/projects/{id}/status   → { status: "active" }
  9. streamThinkingGraphIntakeQuestions() → стримит intake-вопросы
 10. (если есть вопросы) → показывает их пользователю
 11. saveThinkingGraphIntakeAnswers() + saveProjectThinkingGraphSession()
 12. router.push( buildThinkingGraphLaunchUrl({projectId, autoPersonaIds, autostart}) )
     → переходит на /tofo/projects/{id}
```

---

## Найденные проблемы

### 🔴 КРИТИЧНО — `autoPersonaIds` и `autostart` всегда теряются

**Файл:** `launchConfig.ts`

```ts
export function buildThinkingGraphLaunchUrl(input: {
  projectId: string;
  autoPersonaIds?: string[];
  autostart: boolean;
}): string {
  return `/tofo/projects/${input.projectId}`;  // параметры игнорируются!
}
```

Страница `[id]/page.tsx` умеет читать `?autostart=true` и `?personas=...` из searchParams, но функция никогда не добавляет их в URL. Результат:
- Галочка "Launch simulation automatically" (autostart) **никогда не работает**.
- Выбор команды **не передаётся** на страницу проекта при запуске.

**Фикс:** добавить query-параметры в возвращаемый URL.

---

### 🟠 МЕРТВЫЙ КОД — `new/page.tsx` и `NewProjectForm.tsx` не используются

**Файлы:** `new/page.tsx`, `new/NewProjectForm.tsx`, `new/actions.ts`

`new/page.tsx` немедленно делает `redirect("/tofo/projects")` — форма создания проекта была перенесена в модалку (`CreateProjectModal` в `ProjectsPageClient.tsx`), но старый код `new/` не удалён.

- `NewProjectForm.tsx` — **нигде не импортируется**.
- `new/actions.ts` — server action, использует старый `createProject` (не `createDraftProject`) и редиректит на несуществующий `/tofo/thinking-graph?projectId=...`.
- `new/utils.ts` — **единственный живой файл** в папке: `avatarColor`/`avatarLetters` импортируются из teams-страниц.

---

### 🟠 ДУБЛИРУЮЩИЙ КОД — два параллельных потока создания

`NewProjectForm.tsx` (1032 строки) и `CreateProjectModal` внутри `ProjectsPageClient.tsx` реализуют одинаковый launch-алгоритм независимо. При изменении логики нужно обновлять оба места — текущий рабочий код в `ProjectsPageClient.tsx` уже разошёлся с заброшенным `NewProjectForm.tsx`:

| Отличие | NewProjectForm | CreateProjectModal |
|---|---|---|
| Поле "Name" | нет | есть |
| Загрузка файлов | немедленно в S3 | очередь `pendingFiles`, загрузка при launch |
| PATCH-обновление idea | debounce 2s | нет |
| Шаг `launchStep` | enum + labels | произвольная строка |

---

### 🟡 КОД-СМЕЛЛ — `projectIdRef` через `useState`

**Файл:** `ProjectsPageClient.tsx:214`

```ts
const [projectIdRef] = useState<{ current: string | null }>({ current: null });
```

Используется как мутабельный ref (`projectIdRef.current = pid`), но создан через `useState`. Следует заменить на `useRef<string | null>(null)` для ясности.

---

### 🟡 ПОТЕНЦИАЛЬНАЯ ГОНКА — двойной debounce в `NewProjectForm`

Два `useEffect` с debounce работают одновременно:
- Effect 1 (`idea` → `triggerDraftCreation`): 1 500 мс, создаёт черновик
- Effect 2 (`idea + draftProjectId` → `persistDraftState`): 2 000 мс, обновляет idea

Если пользователь меняет идею после создания черновика, оба тайаута сбрасываются через **один** `draftDebounceRef`. Effect 2 перезапишет таймер Effect 1 — черновик может не создаться при быстром редактировании. (Актуально только для `NewProjectForm`, который сейчас мёртв.)

---

## Итог по приоритетам

| # | Проблема | Файл | Приоритет |
|---|---|---|---|
| 1 | `buildThinkingGraphLaunchUrl` теряет autostart и personas | `launchConfig.ts` | ✅ ИСПРАВЛЕНО (0.8.6) |
| 2 | `new/page.tsx`, `NewProjectForm.tsx`, `new/actions.ts` — мёртвый код | `new/` folder | ✅ УДАЛЕНО (0.8.6) |
| 3 | Дублирующийся launch-алгоритм | `ProjectsPageClient.tsx` | ✅ ЗАКРЫТО п.2 — второй экземпляр был в NewProjectForm.tsx |
| 4 | `projectIdRef` через `useState` | `ProjectsPageClient.tsx:214` | ✅ ИСПРАВЛЕНО (0.8.6) |
| 5 | Двойной debounce через один ref | `NewProjectForm.tsx` | ✅ ЗАКРЫТО п.2 — файл удалён |
