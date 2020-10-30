/* eslint-env browser */

import { createElement, passiveCaptureOptions } from '../core/utils/dom.js';
import { getBoundingRect } from '../core/utils/layout.js';
import { pointerXY } from '../core/utils/pointer.js';
import debounce from '../core/utils/debounce.js';

function isBoxChanged(oldBox, newBox) {
    if (oldBox === null) {
        return true;
    }

    for (const prop of ['top', 'left', 'width', 'height']) {
        if (oldBox[prop] !== newBox[prop]) {
            return true;
        }
    }

    return false;
}

export default (host) => {
    let inspectorActivated = false;
    let lastOverlayEl = null;
    let lastHoverViewTreeLeaf = null;
    let selectedTreeViewLeaf = null;
    let hideTimer = null;
    let syncOverlayTimer;

    const detailsSidebarLeafExpanded = new Set();
    const viewByEl = new Map();
    const overlayByViewNode = new Map();
    const overlayLayerEl = createElement('div', {
        class: 'discovery-view-inspector-overlay',
        onclick() {
            selectTreeViewLeaf(
                lastHoverViewTreeLeaf && !selectedTreeViewLeaf ? lastHoverViewTreeLeaf : null
            );
        }
    });
    const syncOverlayState = debounce(() => {
        // don't sync change a view selected
        if (!inspectorActivated || selectedTreeViewLeaf !== null) {
            return;
        }

        // console.time('syncOverlayState');
        const tree = host.view.getViewTree([popup.el]);
        const overlayToRemove = new Set([...overlayByViewNode.keys()]);
        const walk = function walk(leafs, parentEl) {
            for (const leaf of leafs) {
                if (!leaf.node || (!leaf.view && !leaf.viewRoot)) {
                    if (leaf.children.length) {
                        walk(leaf.children, parentEl);
                    }

                    continue;
                }

                const box = getBoundingRect(leaf.node, parentEl);
                let overlay = overlayByViewNode.get(leaf.node) || null;

                if (overlay === null) {
                    overlay = {
                        el: parentEl.appendChild(createElement('div', leaf.viewRoot ? 'overlay view-root' : 'overlay')),
                        box: null
                    };
                    overlayByViewNode.set(leaf.node, overlay);
                    viewByEl.set(overlay.el, leaf);
                } else {
                    overlayToRemove.delete(leaf.node);
                }

                if (isBoxChanged(overlay.box, box)) {
                    overlay.el.style.top = `${box.top}px`;
                    overlay.el.style.left = `${box.left}px`;
                    overlay.el.style.width = `${box.width}px`;
                    overlay.el.style.height = `${box.height}px`;
                    overlay.box = box;
                }

                if (leaf.children.length) {
                    overlay.el.style.overflow = getComputedStyle(leaf.node).overflow !== 'visible' ? 'hidden' : 'visible';
                    walk(leaf.children, overlay.el);
                }
            }
        };

        walk(tree, overlayLayerEl);

        for (const node of overlayToRemove) {
            overlayByViewNode.get(node).el.remove();
            overlayByViewNode.delete(node);
        }
        // console.timeEnd('syncOverlayState');

        updateState();
    }, { maxWait: 0, wait: 50 });
    const updateState = () => {
        const { x, y } = pointerXY.value;
        onHover([...document.elementsFromPoint(x | 0, y | 0) || []]
            .find(el => viewByEl.has(el)) || null
        );
    };
    const keyPressedEventListener = (e) => {
        if (e.key === 'Escase' || e.keyCode === 27 || e.which === 27) {
            host.inspectMode.set(false);
        }
    };
    const enableInspect = () => {
        if (!inspectorActivated) {
            inspectorActivated = true;
            document.addEventListener('scroll', syncOverlayState, passiveCaptureOptions);
            document.addEventListener('keydown', keyPressedEventListener, true);
            pointerXY.subscribe(syncOverlayState);
            syncOverlayTimer = setInterval(syncOverlayState, 500);
            host.dom.container.append(overlayLayerEl);
            syncOverlayState();
        }
    };
    const disableInspect = () => {
        if (inspectorActivated) {
            inspectorActivated = false;
            clearInterval(syncOverlayTimer);
            document.removeEventListener('scroll', syncOverlayState, passiveCaptureOptions);
            document.removeEventListener('keydown', keyPressedEventListener, true);
            pointerXY.unsubscribe(syncOverlayState);
            overlayLayerEl.remove();
            hide();
        }
    };
    const selectTreeViewLeaf = (leaf) => {
        selectedTreeViewLeaf = leaf || null;

        if (leaf) {
            popup.show();
            popup.freeze();
        } else if (inspectByQuick) {
            inspectByQuick = false;
            host.inspectMode.set(false);
        } else {
            detailsSidebarLeafExpanded.clear();
            hide();
            syncOverlayState();
        }
    };

    const popup = new host.view.Popup({
        className: 'discovery-inspect-details-popup',
        position: 'pointer',
        hideIfEventOutside: false,
        hideOnResize: false,
        render(el) {
            const targetLeaf = selectedTreeViewLeaf || lastHoverViewTreeLeaf;
            const stack = [];
            let cursor = targetLeaf;

            while (cursor !== null && (cursor.view || cursor.viewRoot)) {
                if (cursor !== targetLeaf && selectedTreeViewLeaf !== null) {
                    detailsSidebarLeafExpanded.add(cursor);
                }

                stack.unshift(cursor);
                cursor = cursor.parent;
            }

            host.view.render(el, {
                view: 'context',
                modifiers: {
                    view: 'tree',
                    when: selectedTreeViewLeaf !== null,
                    data: '$[0]',
                    className: 'sidebar',
                    limitLines: false,
                    itemConfig: {
                        collapsible: '=not viewRoot',
                        expanded: leaf => detailsSidebarLeafExpanded.has(leaf),
                        onToggle: (state, _, leaf) => state
                            ? detailsSidebarLeafExpanded.add(leaf)
                            : detailsSidebarLeafExpanded.delete(leaf)
                    },
                    item: {
                        view: 'switch',
                        content: [
                            {
                                when: 'viewRoot',
                                content: {
                                    view: 'block',
                                    className: 'view-root',
                                    content: 'text:viewRoot.name'
                                }
                            },
                            {
                                when: '$ = #.selected',
                                content: {
                                    view: 'block',
                                    className: 'selected',
                                    content: 'text:(view.config.view or "#root")',
                                    postRender(el) {
                                        requestAnimationFrame(() => el.scrollIntoView());
                                    }
                                }
                            },
                            {
                                content: {
                                    view: 'link',
                                    data: '{ text: view.config.view or "#root", href: false, leaf: $ }',
                                    onClick(_, data) {
                                        selectTreeViewLeaf(data.leaf);
                                    }
                                }
                            }
                        ]
                    }
                },
                content: {
                    view: 'context',
                    modifiers: {
                        view: 'toggle-group',
                        className: 'stack-view-chain',
                        name: 'view',
                        data: '.({ text: viewRoot.name or view.config.view, value: $ })',
                        value: '=$[-1].value',
                        toggleConfig: {
                            className: data => data.value.viewRoot ? 'view-root' : ''
                        }
                    },
                    content: {
                        view: 'block',
                        className: 'inspect-details-content',
                        data: '#.view | view or viewRoot',
                        content: [
                            {
                                view: 'block',
                                className: 'config',
                                content: [
                                    {
                                        view: 'struct',
                                        expanded: 2,
                                        data: 'props'
                                    },
                                    {
                                        view: 'block',
                                        className: 'raw-config'
                                    },
                                    {
                                        view: 'struct',
                                        expanded: 1,
                                        data: 'config'
                                    },
                                    {
                                        view: 'tree',
                                        data: data => host.view.getViewConfigTransitionTree(data.config).deps,
                                        whenData: true,
                                        expanded: 3,
                                        children: 'deps',
                                        item: {
                                            view: 'struct',
                                            expanded: 1,
                                            data: 'value'
                                        }
                                    }
                                ]
                            },
                            {
                                view: 'block',
                                className: 'data',
                                content: {
                                    view: 'struct',
                                    expanded: 1,
                                    data: 'data'
                                }
                            },
                            {
                                view: 'block',
                                className: 'context',
                                content: {
                                    view: 'struct',
                                    expanded: 1,
                                    data: 'context'
                                }
                            }
                        ]
                    }
                }
            }, stack, { selected: targetLeaf });
        }
    });
    const hide = () => {
        if (lastOverlayEl) {
            lastOverlayEl.classList.remove('hovered');
        }

        lastOverlayEl = null;
        lastHoverViewTreeLeaf = null;
        selectedTreeViewLeaf = null;

        popup.hide();
    };
    const onHover = overlayEl => {
        if (overlayEl === lastOverlayEl) {
            return;
        }

        if (lastOverlayEl !== null) {
            lastOverlayEl.classList.remove('hovered');
        }

        lastOverlayEl = overlayEl;

        if (overlayEl === null) {
            hideTimer = setTimeout(hide, 100);
            return;
        }

        overlayEl.classList.add('hovered');

        const leaf = viewByEl.get(overlayEl) || null;

        if (leaf === null) {
            lastHoverViewTreeLeaf = null;
            return;
        }

        if (lastHoverViewTreeLeaf !== null && leaf.view === lastHoverViewTreeLeaf.view) {
            return;
        }

        lastHoverViewTreeLeaf = leaf;
        clearTimeout(hideTimer);

        popup.show();
    };

    host.inspectMode.subscribeSync(
        enabled => enabled ? enableInspect() : disableInspect()
    );

    //
    // quick inspection
    //
    let inspectByQuick = false;
    document.addEventListener('keydown', quickInspect, true);
    document.addEventListener('keyup', quickInspect, true);
    function quickInspect(e) {
        if (e.key === 'Alt' || e.keyCode === 18 || e.which === 18) {
            if (e.type === 'keydown') {
                if (!inspectorActivated) {
                    inspectByQuick = true;
                    host.inspectMode.set(true);
                }
            } else {
                if (inspectByQuick && !selectedTreeViewLeaf) {
                    inspectByQuick = false;
                    host.inspectMode.set(false);
                }
            }
        }
    }
};
