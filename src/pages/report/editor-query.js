import { createElement } from '../../core/utils/dom.js';

function createEditor(discovery, container) {
    const ctx = {
        data: null,
        context: null,
        updateContent: () => {},
        liveEdit: true,
        suggestions: true
    };

    const editor = new discovery.view.QueryEditor({
        placeholder: 'Jora query...',
        extraKeys: { 'Cmd-Enter': () => ctx.updateContent(editor.getValue()) },
        autocomplete: (query, offset) =>
            ctx.suggestions
                ? discovery.querySuggestions(query, offset, ctx.data, ctx.context)
                : []
    })
        .on('change', value => ctx.liveEdit && ctx.updateContent(value));

    const performButtonEl = createElement('span', {
        class: 'perform-button disabled',
        onclick: () => ctx.updateContent(editor.getValue(), true)
    }, 'Run (Cmd+Enter)');

    container
        .appendChild(editor.el)
        .appendChild(createElement('div', 'editor-toolbar', [
            performButtonEl,
            createElement('span', {
                class: 'toggle-button live-update-button',
                title: 'Perform on editing (live update)',
                onclick: ({ target }) => {
                    ctx.liveEdit = !ctx.liveEdit;
                    target.classList.toggle('disabled', !ctx.liveEdit);
                    performButtonEl.classList.toggle('disabled', ctx.liveEdit);
                    editor.focus();

                    if (ctx.liveEdit) {
                        ctx.updateContent(editor.getValue());
                    }
                }
            }),
            createElement('span', {
                class: 'toggle-button suggestions-button',
                title: 'Show suggestions',
                onclick: ({ target }) => {
                    ctx.suggestions = !ctx.suggestions;
                    target.classList.toggle('disabled', !ctx.suggestions);
                    editor.focus();
                }
            })
        ]));

    return (content, data, context, updateContent) => {
        Object.assign(ctx, { data, context, updateContent });
        editor.setValue(content);
    };
}

function renderHint(discovery, el) {
    const { name, link, version } = discovery.getQueryEngineInfo();

    el.href = link;
    el.textContent = `${name} ${version || ''}`;
}

export default function(discovery, { editorEl, headerHintEl }) {
    let editor = null;

    renderHint(discovery, headerHintEl);

    return function(query = '', data, context, { updateContent, editable }) {
        if (editable) {
            if (editor === null) {
                editor = createEditor(discovery, editorEl);
            }

            editor(query, data, context, updateContent);
        }

        // perform data query
        const queryStartTime = Date.now();

        return {
            data: discovery.query(query, data, context),
            time: Date.now() - queryStartTime
        };
    };
}
