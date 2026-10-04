// In-game to-do list (ex-todolist).
// A self-contained, Shadow-DOM-isolated to-do widget pinned to the page.
// Tasks are stored per-village in browser.storage.local; the widget supports
// inline editing, drag-and-drop reordering, per-village collapse, and a
// draggable position. Enabling/disabling the feature (QoL options toggle)
// replaces the old standalone popup's show/hide.
//
// Compliance note: pure local UI + storage. No clicks on the game, no network.
(function () {
	'use strict';

	// Chrome/Firefox cross-browser shim
	const browser = globalThis.browser ?? chrome; // eslint-disable-line no-undef

	const ROOT_ID = 'travian-todo-root';

	/* ---- constants ---- */
	const STORAGE_KEY = 'travianTasks';
	const UI_STATE_KEY = 'travianTodoUI';
	const SAVE_DELAY_MS = 300; // debounce interval for storage writes
	const MAX_TASK_LEN = 200; // character limit per task name
	const TASK_LIST_MAX_HEIGHT = '700px';

	/* =====================================================================
	 * VILLAGE DETECTOR
	 * ===================================================================== */
	const VillageDetector = {
		detect() {
			const id = this._idFromURL() ?? this._idFromDOM() ?? 'default';
			const name = this._nameFromDOM() ?? 'Current Village';
			return { id, name };
		},
		_idFromURL() {
			const val = new URLSearchParams(window.location.search).get('newdid');
			return val || null;
		},
		_idFromDOM() {
			const node = this._activeVillageNode();
			return node?.dataset?.did ?? null;
		},
		_nameFromDOM() {
			const node = this._activeVillageNode()?.querySelector('.name');
			return node?.textContent?.trim() || null;
		},
		_activeVillageNode() {
			return (
				document.querySelector('.villageList .listEntry.active') ??
				document.querySelector('#sidebarBoxVillagelist .active')
			);
		},
	};

	/* =====================================================================
	 * STORAGE MANAGER
	 * ===================================================================== */
	class StorageManager {
		_timer = null;

		async loadTasks() {
			try {
				const result = await browser.storage.local.get(STORAGE_KEY);
				return result[STORAGE_KEY] ?? {};
			} catch (err) {
				console.error('[TodoList] Failed to load tasks:', err);
				return {};
			}
		}

		saveTasks(tasks) {
			clearTimeout(this._timer);
			this._timer = setTimeout(async () => {
				try {
					await browser.storage.local.set({ [STORAGE_KEY]: tasks });
				} catch (err) {
					console.error('[TodoList] Failed to save tasks:', err);
				}
			}, SAVE_DELAY_MS);
		}

		async loadUIState() {
			try {
				const result = await browser.storage.local.get(UI_STATE_KEY);
				return result[UI_STATE_KEY] ?? {};
			} catch {
				return {};
			}
		}

		async saveUIState(state) {
			try {
				await browser.storage.local.set({ [UI_STATE_KEY]: state });
			} catch {
				/* non-critical — silently ignore */
			}
		}

		// Cancel any pending debounced write (used on feature teardown).
		dispose() {
			clearTimeout(this._timer);
			this._timer = null;
		}
	}

	/* =====================================================================
	 * TASK MANAGER
	 * ===================================================================== */
	class TaskManager {
		constructor(villageId, allTasks, onChanged) {
			this._vid = villageId;
			this._all = allTasks;
			this._onChange = onChanged;
			if (!this._all[this._vid]) this._all[this._vid] = [];
		}

		get tasks() {
			return this._all[this._vid];
		}

		add(text) {
			const cleaned = text.trim().slice(0, MAX_TASK_LEN);
			if (!cleaned) return false;
			this.tasks.push(cleaned);
			this._onChange();
			return true;
		}

		remove(index) {
			if (index < 0 || index >= this.tasks.length) return;
			this.tasks.splice(index, 1);
			this._onChange();
		}

		rename(index, newName) {
			const cleaned = newName.trim().slice(0, MAX_TASK_LEN);
			if (!cleaned || index < 0 || index >= this.tasks.length) return false;
			if (this.tasks[index] === cleaned) return false; // no-op
			this.tasks[index] = cleaned;
			this._onChange();
			return true;
		}

		move(from, to) {
			const list = this.tasks;
			if (from === to) return;
			if (from < 0 || from >= list.length) return;
			if (to < 0 || to >= list.length) return;
			const [item] = list.splice(from, 1);
			list.splice(to, 0, item);
			this._onChange();
		}
	}

	/* =====================================================================
	 * CSS STYLES
	 * ===================================================================== */
	const STYLES = `
		:host {
			--bg-primary: #1a1a1e;
			--bg-secondary: #242428;
			--bg-tertiary: #2a2a2f;
			--bg-hover: #333338;
			--bg-active: #3a3a40;
			--text-primary: #e8e8ec;
			--text-secondary: #a0a0a8;
			--text-muted: #666670;
			--accent-primary: #6366f1;
			--accent-primary-hover: #7577f5;
			--accent-success: #22c55e;
			--accent-danger: #ef4444;
			--accent-danger-hover: #f55555;
			--accent-warning: #f59e0b;
			--border-color: #3a3a40;
			--border-radius: 6px;
			--border-radius-sm: 4px;
			--transition-fast: 0.15s ease;

			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
			font-size: 13px;
			line-height: 1.5;
			color: var(--text-primary);
		}

		*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

		#app-container {
			background: var(--bg-primary);
			width: 230px;
			border: 1px solid var(--border-color);
			border-radius: var(--border-radius);
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
			display: flex;
			flex-direction: column;
			overflow: hidden;
			user-select: none;
		}

		/* ----- Header (drag handle for widget repositioning) ----- */
		.header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 5px 8px;
			background: var(--bg-secondary);
			border-bottom: 1px solid var(--border-color);
			cursor: grab;
		}
		.header:active { cursor: grabbing; }

		.header-title h1 {
			font-size: 13px;
			font-weight: 600;
			color: var(--text-primary);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			max-width: 160px;
		}
		.active-badge {
			display: block;
			font-size: 10px;
			color: var(--accent-success);
			font-weight: 500;
			margin-top: 1px;
		}

		.btn-toggle {
			background: transparent;
			border: none;
			color: var(--text-secondary);
			cursor: pointer;
			font-weight: bold;
			font-size: 14px;
			padding: 2px 4px;
			transition: color var(--transition-fast);
		}
		.btn-toggle:hover { color: var(--text-primary); }

		/* ----- Collapsible Body ----- */
		#list-body {
			padding: 6px;
			display: flex;
			flex-direction: column;
			gap: 10px;
		}
		#list-body.hidden { display: none !important; }

		/* ----- Task List ----- */
		.task-list {
			max-height: ${TASK_LIST_MAX_HEIGHT};
			overflow-y: auto;
			overflow-x: hidden;
			display: flex;
			flex-direction: column;
			gap: 3px;
			scrollbar-width: thin;
			scrollbar-color: rgba(255,255,255,0.15) transparent;
		}

		.task-empty {
			color: var(--text-muted);
			font-size: 11px;
			text-align: center;
			padding: 16px;
			background: var(--bg-tertiary);
			border-radius: var(--border-radius-sm);
		}

		/* ----- Individual Task Row ----- */
		.task-row {
			display: flex;
			align-items: center;
			gap: 6px;
			padding: 5px 6px;
			background: var(--bg-tertiary);
			border-radius: var(--border-radius-sm);
			transition: background var(--transition-fast);
		}
		.task-row:hover { background: var(--bg-hover); }
		.task-row.drag-over {
			border-top: 2px solid var(--accent-primary);
			padding-top: 3px;
		}
		.task-row.dragging {
			opacity: 0.4;
		}

		/* Drag handle */
		.drag-handle {
			cursor: grab;
			color: var(--text-muted);
			font-size: 10px;
			padding: 0 2px;
			flex-shrink: 0;
			line-height: 1;
		}
		.drag-handle:active { cursor: grabbing; }

		.task-name {
			flex: 1;
			font-size: 12px;
			font-weight: 500;
			word-break: break-word;
			min-width: 0;
			cursor: default;
		}

		/* Inline edit input */
		.task-edit-input {
			flex: 1;
			font-size: 12px;
			font-weight: 500;
			background: var(--bg-primary);
			border: 1px solid var(--accent-primary);
			border-radius: 3px;
			color: var(--text-primary);
			padding: 2px 4px;
			outline: none;
			min-width: 0;
		}

		/* ----- Task Action Buttons ----- */
		.task-actions {
			display: flex;
			gap: 1px;
			opacity: 0;
			transition: opacity var(--transition-fast);
			flex-shrink: 0;
		}
		.task-row:hover .task-actions { opacity: 1; }

		.btn-icon {
			padding: 3px 4px;
			background: transparent;
			border: none;
			color: var(--text-secondary);
			cursor: pointer;
			border-radius: 3px;
			transition: all var(--transition-fast);
			font-size: 10px;
			line-height: 1;
		}
		.btn-icon:hover { background: var(--bg-active); color: var(--text-primary); }
		.btn-icon.danger:hover { color: var(--accent-danger); }
		.btn-icon.edit:hover { color: var(--accent-warning); }
		.btn-icon.move:hover { color: var(--accent-primary); }

		/* ----- Input Area ----- */
		.input-group {
			display: flex;
			gap: 6px;
		}
		.input {
			background: var(--bg-tertiary);
			border: 1px solid var(--border-color);
			border-radius: var(--border-radius-sm);
			padding: 7px 9px;
			font-size: 12px;
			color: var(--text-primary);
			flex-grow: 1;
			transition: border-color var(--transition-fast);
			min-width: 0;
		}
		.input:focus { outline: none; border-color: var(--accent-primary); }
		.input::placeholder { color: var(--text-muted); }

		.btn-primary {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			padding: 7px 8px;
			font-size: 11px;
			font-weight: 500;
			border: none;
			border-radius: var(--border-radius-sm);
			cursor: pointer;
			transition: all var(--transition-fast);
			background: var(--accent-primary);
			color: white;
			flex-shrink: 0;
		}
		.btn-primary:hover { background: var(--accent-primary-hover); }
	`;

	/* =====================================================================
	 * WIDGET RENDERER
	 * ===================================================================== */
	class WidgetRenderer {
		constructor(shadow, village, callbacks) {
			this._shadow = shadow;
			this._village = village;
			this._cb = callbacks;
			this._editIndex = null;

			this._injectStyles();
			this._buildSkeleton();
			this._cacheElements();
			this._bindEvents();
		}

		_injectStyles() {
			const style = document.createElement('style');
			style.textContent = STYLES;
			this._shadow.appendChild(style);
		}

		_buildSkeleton() {
			const c = document.createElement('div');
			c.id = 'app-container';
			c.innerHTML = `
				<div class="header" id="widget-header">
					<div class="header-title">
						<h1 id="village-title">${this._escapeHTML(this._village.name)}</h1>
						<span class="active-badge">Active Village</span>
					</div>
					<button class="btn-toggle" id="toggle-btn" aria-label="Toggle list visibility" title="Collapse / Expand">_</button>
				</div>
				<div id="list-body">
					<div class="task-list" id="task-list"></div>
					<div class="input-group">
						<input type="text" class="input" id="task-input"
									 placeholder="Add a task…" autocomplete="off"
									 maxlength="${MAX_TASK_LEN}" />
						<button class="btn-primary" id="add-btn">Add</button>
					</div>
				</div>`;
			this._shadow.appendChild(c);
		}

		_cacheElements() {
			const $ = (id) => this._shadow.getElementById(id);
			this._taskList = $('task-list');
			this._taskInput = $('task-input');
			this._addBtn = $('add-btn');
			this._toggleBtn = $('toggle-btn');
			this._listBody = $('list-body');
			this._header = $('widget-header');
		}

		_bindEvents() {
			this._addBtn.addEventListener('click', () => this._handleAdd());
			this._taskInput.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') this._handleAdd();
			});

			this._taskList.addEventListener('click', (e) => this._handleTaskClick(e));

			this._taskList.addEventListener('dblclick', (e) => {
				const row = e.target.closest('.task-row');
				if (!row || e.target.closest('.task-actions')) return;
				this._startEdit(parseInt(row.dataset.index, 10));
			});

			this._toggleBtn.addEventListener('click', () => this._toggleCollapse());

			this._taskList.addEventListener('dragstart', (e) => this._onDragStart(e));
			this._taskList.addEventListener('dragover', (e) => this._onDragOver(e));
			this._taskList.addEventListener('dragleave', (e) => this._onDragLeave(e));
			this._taskList.addEventListener('drop', (e) => this._onDrop(e));
			this._taskList.addEventListener('dragend', (e) => this._onDragEnd(e));
		}

		_handleAdd() {
			const text = this._taskInput.value;
			if (this._cb.onAdd(text)) {
				this._taskInput.value = '';
			}
			this._taskInput.focus();
		}

		_handleTaskClick(e) {
			const btn = e.target.closest('.btn-icon');
			if (!btn) return;

			const row = btn.closest('.task-row');
			const index = parseInt(row.dataset.index, 10);

			if (btn.classList.contains('action-delete')) this._cb.onRemove(index);
			else if (btn.classList.contains('action-edit')) this._startEdit(index);
			else if (btn.classList.contains('action-up'))
				this._cb.onMove(index, index - 1);
			else if (btn.classList.contains('action-down'))
				this._cb.onMove(index, index + 1);
		}

		_startEdit(index) {
			if (this._editIndex !== null) return; // already editing
			this._editIndex = index;

			const row = this._taskList.querySelector(
				`.task-row[data-index="${index}"]`,
			);
			if (!row) return;

			const nameSpan = row.querySelector('.task-name');
			const original = nameSpan.textContent;

			const input = document.createElement('input');
			input.className = 'task-edit-input';
			input.value = original;
			input.maxLength = MAX_TASK_LEN;

			nameSpan.replaceWith(input);
			input.focus();
			input.select();

			const commit = () => {
				this._editIndex = null;
				this._cb.onRename(index, input.value);
			};

			const cancel = () => {
				this._editIndex = null;
				this._cb.onRename(index, original); // no-op rename triggers re-render
			};

			input.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					commit();
				}
				if (e.key === 'Escape') {
					e.preventDefault();
					cancel();
				}
			});
			input.addEventListener('blur', () => commit());
		}

		_dragIndex = null;

		_onDragStart(e) {
			const row = e.target.closest('.task-row');
			if (!row) return;
			this._dragIndex = parseInt(row.dataset.index, 10);
			row.classList.add('dragging');
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', String(this._dragIndex));
		}

		_onDragOver(e) {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'move';
			const row = e.target.closest('.task-row');
			if (row) row.classList.add('drag-over');
		}

		_onDragLeave(e) {
			const row = e.target.closest('.task-row');
			if (row) row.classList.remove('drag-over');
		}

		_onDrop(e) {
			e.preventDefault();
			const row = e.target.closest('.task-row');
			if (!row || this._dragIndex === null) return;

			const targetIndex = parseInt(row.dataset.index, 10);
			row.classList.remove('drag-over');

			if (this._dragIndex !== targetIndex) {
				this._cb.onMove(this._dragIndex, targetIndex);
			}
			this._dragIndex = null;
		}

		_onDragEnd() {
			this._dragIndex = null;
			this._taskList.querySelectorAll('.dragging, .drag-over').forEach((el) => {
				el.classList.remove('dragging', 'drag-over');
			});
		}

		_toggleCollapse() {
			const collapsed = this._listBody.classList.toggle('hidden');
			this._toggleBtn.textContent = collapsed ? '+' : '_';
			this._cb.onToggle?.(collapsed);
			return collapsed;
		}

		setCollapsed(collapsed) {
			this._listBody.classList.toggle('hidden', collapsed);
			this._toggleBtn.textContent = collapsed ? '+' : '_';
		}

		render(tasks) {
			this._editIndex = null;
			this._taskList.innerHTML = '';

			if (tasks.length === 0) {
				this._taskList.innerHTML =
					'<div class="task-empty">No tasks for this village yet.</div>';
				return;
			}

			const fragment = document.createDocumentFragment();

			tasks.forEach((task, i) => {
				const row = document.createElement('div');
				row.className = 'task-row';
				row.dataset.index = i;
				row.draggable = true;

				const handle = document.createElement('span');
				handle.className = 'drag-handle';
				handle.textContent = '⠿';
				handle.title = 'Drag to reorder';

				const name = document.createElement('span');
				name.className = 'task-name';
				name.textContent = task;

				const actions = document.createElement('div');
				actions.className = 'task-actions';

				actions.appendChild(this._iconBtn('▲', 'action-up move', 'Move up'));
				actions.appendChild(this._iconBtn('▼', 'action-down move', 'Move down'));
				actions.appendChild(this._iconBtn('✎', 'action-edit edit', 'Edit name'));
				actions.appendChild(this._iconBtn('✕', 'action-delete danger', 'Delete'));

				row.append(handle, name, actions);
				fragment.appendChild(row);
			});

			this._taskList.appendChild(fragment);
		}

		_iconBtn(icon, extraClass, title) {
			const btn = document.createElement('button');
			btn.className = `btn-icon ${extraClass}`;
			btn.textContent = icon;
			btn.title = title;
			btn.setAttribute('aria-label', title);
			return btn;
		}

		_escapeHTML(str) {
			const div = document.createElement('div');
			div.textContent = str;
			return div.innerHTML;
		}

		get headerElement() {
			return this._header;
		}

		setVillage(village) {
			this._village = village;
			const titleEl = this._shadow.getElementById('village-title');
			if (titleEl) titleEl.textContent = village.name;
		}
	}

	/* =====================================================================
	 * WIDGET POSITION DRAGGER
	 * ===================================================================== */
	class WidgetDragger {
		constructor(host, handle, storage) {
			this._host = host;
			this._storage = storage;
			this._offsetX = 0;
			this._offsetY = 0;

			const onMouseMove = (e) => this._onMove(e);
			const onMouseUp = () => {
				document.removeEventListener('mousemove', onMouseMove);
				document.removeEventListener('mouseup', onMouseUp);
				this._persist();
			};

			handle.addEventListener('mousedown', (e) => {
				if (e.target.closest('button')) return;
				e.preventDefault();
				this._offsetX = e.clientX - this._host.offsetLeft;
				this._offsetY = e.clientY - this._host.offsetTop;
				document.addEventListener('mousemove', onMouseMove);
				document.addEventListener('mouseup', onMouseUp);
			});
		}

		_onMove(e) {
			const x = Math.max(0, e.clientX - this._offsetX);
			const y = Math.max(0, e.clientY - this._offsetY);
			this._host.style.left = `${x}px`;
			this._host.style.top = `${y}px`;
		}

		async _persist() {
			const state = await this._storage.loadUIState();
			state.left = this._host.style.left;
			state.top = this._host.style.top;
			await this._storage.saveUIState(state);
		}

		applyPosition(pos) {
			if (pos.left) this._host.style.left = pos.left;
			if (pos.top) this._host.style.top = pos.top;
		}
	}

	/* =====================================================================
	 * TODO WIDGET — main orchestrator
	 * ===================================================================== */
	class TodoWidget {
		constructor() {
			this._village = VillageDetector.detect();
			this._storage = new StorageManager();
			this._allTasks = {};
			this._tasks = null;
			this._renderer = null;
			this._host = null;
			this._villageObserver = null;
			this._checkHandler = null;
			this._villageDebounce = null;

			this._init();
		}

		async _init() {
			// 1. Create the host element (Shadow DOM boundary)
			const host = document.createElement('div');
			host.id = ROOT_ID;
			host.style.cssText =
				'position: fixed; top: 151px; left: 8px; z-index: 1; display: none;';
			document.body.appendChild(host);
			this._host = host;

			const shadow = host.attachShadow({ mode: 'open' });

			// 2. Load data
			this._allTasks = await this._storage.loadTasks();

			// 3. Create task manager
			this._tasks = new TaskManager(this._village.id, this._allTasks, () =>
				this._onDataChanged(),
			);

			// 4. Build the UI
			this._renderer = new WidgetRenderer(shadow, this._village, {
				onAdd: (text) => this._tasks.add(text),
				onRemove: (i) => this._tasks.remove(i),
				onRename: (i, n) => {
					if (!this._tasks.rename(i, n)) this._render();
				},
				onMove: (f, t) => this._tasks.move(f, t),
				onToggle: (collapsed) => this._persistCollapse(collapsed),
			});

			// 5. Enable widget dragging
			const dragger = new WidgetDragger(
				host,
				this._renderer.headerElement,
				this._storage,
			);

			// 6. Restore UI state. The QoL options toggle controls on/off, so the
			// widget is always shown while the feature is enabled (the old
			// standalone popup's hide/show is gone).
			const uiState = await this._storage.loadUIState();
			const villageCollapsed =
				uiState.collapsedByVillage?.[this._village.id] ?? false;
			if (villageCollapsed) this._renderer.setCollapsed(true);
			host.style.display = '';
			dragger.applyPosition(uiState);

			// 7. Watch for village switches (Travian uses soft navigation)
			this._watchVillageChanges();

			// 8. Initial render
			this._render();
		}

		_onDataChanged() {
			this._storage.saveTasks(this._allTasks);
			this._render();
		}

		async _persistCollapse(collapsed) {
			const state = await this._storage.loadUIState();
			if (!state.collapsedByVillage) state.collapsedByVillage = {};
			state.collapsedByVillage[this._village.id] = collapsed;
			await this._storage.saveUIState(state);
		}

		_render() {
			this._renderer.render(this._tasks.tasks);
		}

		_watchVillageChanges() {
			const check = () => {
				clearTimeout(this._villageDebounce);
				this._villageDebounce = setTimeout(() => {
					const next = VillageDetector.detect();
					if (next.id !== this._village.id) {
						this._onVillageChanged(next);
					}
				}, 150);
			};
			this._checkHandler = check;

			// URL-based navigation (query string changes)
			window.addEventListener('popstate', check);

			// Travian updates the sidebar DOM when switching villages; watch for that
			const villageList =
				document.querySelector('.villageList') ??
				document.querySelector('#sidebarBoxVillagelist');
			if (villageList) {
				this._villageObserver = new MutationObserver(check);
				this._villageObserver.observe(villageList, {
					subtree: true,
					attributes: true,
					attributeFilter: ['class'],
				});
			}
		}

		async _onVillageChanged(village) {
			this._village = village;
			this._tasks = new TaskManager(village.id, this._allTasks, () =>
				this._onDataChanged(),
			);
			this._renderer.setVillage(village);

			const uiState = await this._storage.loadUIState();
			const collapsed = uiState.collapsedByVillage?.[village.id] ?? false;
			this._renderer.setCollapsed(collapsed);

			this._render();
		}

		// Tear everything down when the feature is toggled off.
		destroy() {
			if (this._villageObserver) {
				this._villageObserver.disconnect();
				this._villageObserver = null;
			}
			if (this._checkHandler) {
				window.removeEventListener('popstate', this._checkHandler);
				this._checkHandler = null;
			}
			clearTimeout(this._villageDebounce);
			this._villageDebounce = null;
			this._storage.dispose();
			if (this._host && this._host.parentNode) this._host.remove();
			this._host = null;
		}
	}

	/* =====================================================================
	 * REGISTRATION
	 * ===================================================================== */
	let widget = null;

	window.TravianQoL.register({
		id: 'todolist',
		label: 'In-game to-do list',
		description:
			'A draggable, per-village to-do widget pinned to the page. Add, edit, reorder and check off tasks; the list is saved separately for each village.',
		init() {
			// Page-scope guard: the standalone version only ran on dorf pages.
			if (!/\/dorf/.test(location.pathname)) return;
			if (document.getElementById(ROOT_ID)) return;
			widget = new TodoWidget();
		},
		destroy() {
			if (widget) {
				widget.destroy();
				widget = null;
			}
			// Safety net in case init() raced ahead of the stored reference.
			const stray = document.getElementById(ROOT_ID);
			if (stray) stray.remove();
		},
	});
})();
