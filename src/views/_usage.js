/* eslint-env browser */
import { jsonStringifyAsJavaScript } from '../core/utils/json.js';

function isTextNode(node) {
    return Boolean(node && node.nodeType === Node.TEXT_NODE);
}

function childrenHtml(node, level = '\n') {
    let res = '';

    for (const child of node.childNodes) {
        if (!isTextNode(child) && child.previousSibling && !isTextNode(child.previousSibling)) {
            res += level;
        }

        res += nodeHtml(child, level);
    }

    return res;
}

function nodeHtml(node, level = '\n') {
    switch (node.nodeType) {
        case Node.ELEMENT_NODE:
            const [start, end = ''] = node.cloneNode().outerHTML.split(/(?=<\/[^>]+>$)/);
            return (
                start +
                (node.firstChild && !isTextNode(node.firstChild) ? level + '  ' : '') +
                childrenHtml(node, level + '  ') +
                (node.lastChild && !isTextNode(node.lastChild) ? level : '') +
                end
            );

        case Node.TEXT_NODE:
            return node.nodeValue;

        case Node.COMMENT_NODE:
            return '<!--' + node.nodeValue + '-->';

        case Node.DOCUMENT_FRAGMENT_NODE:
            return childrenHtml(node, level);
    }

    return '';
}

export default function(host) {
    const renderDemo = {
        view: 'context',
        modifiers: [
            {
                view: 'switch',
                when: 'beforeDemo',
                content: [
                    { when: ({ beforeDemo }) => typeof beforeDemo === 'string', content: 'html:"<p>" + beforeDemo + "</p>"' },
                    { content: {
                        view: 'render',
                        config: 'beforeDemo',
                        context: '{ __demoContext: true, ...(#.viewDef | { name, group, options }) }'
                    } }
                ]
            },
            {
                view: 'block',
                when: 'demo or view',
                className: 'usage-render',
                postRender: (el, { onInit }) => onInit(el, 'root'),
                content: {
                    view: 'render',
                    config: 'demo or view',
                    context: '{ __demoContext: true, ...(#.viewDef | { name, group, options }) }'
                }
            },
            {
                view: 'switch',
                when: 'afterDemo',
                content: [
                    { when: ({ afterDemo }) => typeof afterDemo === 'string', content: 'html:"<p>" + afterDemo + "</p>"' },
                    { content: {
                        view: 'render',
                        config: 'afterDemo',
                        context: '{ __demoContext: true, ...(#.viewDef | { name, group, options }) }'
                    } }
                ]
            }
        ],
        content: {
            view: 'tabs',
            when: 'source != false',
            className: 'usage-sources',
            name: 'code',
            tabs: [
                { value: 'config', text: 'Config (JS)' },
                { value: 'config-json', text: 'Config (JSON)' },
                { value: 'html', text: 'Output (HTML)' }
            ],
            content: {
                view: 'switch',
                content: [
                    { when: '#.code="config"', content: {
                        view: 'source',
                        className: 'first-tab',
                        data: (data) => ({
                            syntax: 'discovery-view',
                            content: jsonStringifyAsJavaScript(data.demo || data.view)
                        })
                    } },
                    { when: '#.code="config-json"', content: {
                        view: 'source',
                        data: (data) => ({
                            syntax: 'json',
                            content: JSON.stringify(data.demo || data.view, null, 4)
                        })
                    } },
                    { when: '#.code="html"', content: {
                        view: 'source',
                        data: (data, context) => ({
                            syntax: 'html',
                            content: childrenHtml(context.root)
                        })
                    } }
                ]
            }
        }
    };

    return {
        view: 'block',
        className: 'discovery-view-usage',
        data({ name, options }) {
            const group = [...host.view.values]
                .filter(view => view.options.usage === options.usage)
                .map(view => view.name);

            if (!group.includes(name)) {
                group.unshift(name);
            }

            return {
                demo: { view: name, data: '"' + name + '"' },
                ...typeof options.usage === 'function'
                    ? options.usage(name, group)
                    : Array.isArray(options.usage)
                        ? { examples: options.usage }
                        : options.usage,
                name,
                group,
                options
            };
        },
        content: [
            'h1:name',
            renderDemo,
            {
                view: 'list',
                data: 'examples.({ ..., viewDef: @ })',
                whenData: true,
                itemConfig: {
                    className: 'usage-section'
                },
                item: [
                    'h2{ anchor: true, data: title }',
                    renderDemo
                ]
            }
        ]
    };
}
