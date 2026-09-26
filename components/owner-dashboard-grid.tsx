"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { WidgetSize } from "@/lib/owner-portal";

export type GridItem = { id: string; size: WidgetSize; title: string };

type Props = {
  items: GridItem[];
  arrange: boolean;
  renderItem: (id: string) => ReactNode;
  onReorder: (order: string[]) => void;
  onHide: (id: string) => void;
  onResize?: (id: string, size: WidgetSize) => void;
};

// Pointer-event sortable grid. Works with mouse and touch without a DnD library:
// press the handle, drag over another card, and the order updates live.
// Arrange mode also exposes move buttons so ordering works without dragging.
export default function OwnerDashboardGrid({ items, arrange, renderItem, onReorder, onHide, onResize }: Props) {
  const [order, setOrder] = useState(items.map((item) => item.id));
  const [dragging, setDragging] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const orderRef = useRef(order);
  const scrollTimer = useRef<number | null>(null);

  useEffect(() => {
    const next = items.map((item) => item.id);
    setOrder(next);
    orderRef.current = next;
  }, [items]);

  const move = useCallback((id: string, toIndex: number) => {
    const current = orderRef.current;
    const from = current.indexOf(id);
    if (from === -1 || toIndex < 0 || toIndex >= current.length || from === toIndex) return;
    const next = [...current];
    next.splice(from, 1);
    next.splice(toIndex, 0, id);
    orderRef.current = next;
    setOrder(next);
  }, []);

  const stopAutoScroll = () => {
    if (scrollTimer.current) { window.clearInterval(scrollTimer.current); scrollTimer.current = null; }
  };

  function onHandlePointerDown(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    if (!arrange) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    setDragging(id);
    let lastY = event.clientY;

    const locate = (x: number, y: number) => {
      const container = containerRef.current;
      if (!container) return null;
      const cards = [...container.querySelectorAll<HTMLElement>("[data-widget-id]")];
      const hit = cards.find((card) => {
        const rect = card.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      });
      return hit?.dataset.widgetId || null;
    };

    const onMove = (moveEvent: PointerEvent) => {
      lastY = moveEvent.clientY;
      const target = locate(moveEvent.clientX, moveEvent.clientY);
      if (target && target !== id) move(id, orderRef.current.indexOf(target));
      // Auto-scroll near the viewport edges so long dashboards can be reordered on phones.
      const edge = 70;
      const viewport = window.innerHeight;
      stopAutoScroll();
      if (lastY < edge || lastY > viewport - edge) {
        const direction = lastY < edge ? -1 : 1;
        scrollTimer.current = window.setInterval(() => window.scrollBy(0, direction * 12), 16);
      }
    };
    const onUp = () => {
      stopAutoScroll();
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      setDragging(null);
      onReorder(orderRef.current);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  }

  function nudge(id: string, delta: number) {
    move(id, orderRef.current.indexOf(id) + delta);
    onReorder(orderRef.current);
  }

  const byId = new Map(items.map((item) => [item.id, item]));

  return (
    <div className={`opGrid ${arrange ? "arranging" : ""}`} ref={containerRef}>
      {order.map((id, index) => {
        const item = byId.get(id);
        if (!item) return null;
        return (
          <section key={id} data-widget-id={id} className={`opWidget size-${item.size} ${dragging === id ? "dragging" : ""}`}>
            {arrange && (
              <div className="opWidgetBar">
                <button
                  type="button"
                  className="opHandle"
                  aria-label={`Drag to move ${item.title}`}
                  onPointerDown={(event) => onHandlePointerDown(event, id)}
                >
                  <span /><span /><span />
                </button>
                <strong>{item.title}</strong>
                <div className="opWidgetTools">
                  {onResize && (
                    <select aria-label="Card size" value={item.size} onChange={(event) => onResize(id, event.target.value as WidgetSize)}>
                      <option value="small">Small</option>
                      <option value="wide">Wide</option>
                      <option value="full">Full</option>
                    </select>
                  )}
                  <button type="button" aria-label="Move earlier" disabled={index === 0} onClick={() => nudge(id, -1)}>↑</button>
                  <button type="button" aria-label="Move later" disabled={index === order.length - 1} onClick={() => nudge(id, 1)}>↓</button>
                  <button type="button" aria-label={`Hide ${item.title}`} onClick={() => onHide(id)}>×</button>
                </div>
              </div>
            )}
            <div className="opWidgetBody">{renderItem(id)}</div>
          </section>
        );
      })}
    </div>
  );
}
