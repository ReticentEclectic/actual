import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { DropPosition as AriaDropPosition } from 'react-aria';
import { useDrag, useDrop } from 'react-dnd';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { useDragRef } from '#hooks/useDragRef';
import { useMergedRefs } from '#hooks/useMergedRefs';

export type DragState<T> = {
  state: 'start-preview' | 'start' | 'end';
  type?: string;
  item?: T;
  preview?: boolean;
};

export type DropPosition = 'top' | 'bottom' | 'on';

export type OnDragChangeCallback<T> = (
  drag: DragState<T>,
) => Promise<void> | void;

type UseDraggableArgs<T> = {
  item?: T;
  type: string;
  canDrag: boolean;
  onDragChange: OnDragChangeCallback<T>;
};

export function useDraggable<T>({
  item,
  type,
  canDrag,
  onDragChange,
}: UseDraggableArgs<T>) {
  const _onDragChange = useRef(onDragChange);

  const [, dragRef] = useDrag({
    type,
    item: () => {
      void _onDragChange.current({ state: 'start-preview', type, item });

      setTimeout(() => {
        void _onDragChange.current({ state: 'start' });
      }, 0);

      return { type, item };
    },
    collect: monitor => ({ isDragging: monitor.isDragging() }),

    end(dragState) {
      void _onDragChange.current({ state: 'end', type, item: dragState.item });
    },

    canDrag() {
      return canDrag;
    },
  });

  useLayoutEffect(() => {
    _onDragChange.current = onDragChange;
  }, [onDragChange]);

  return { dragRef };
}

export type OnDropCallback = (
  id: string,
  dropPos: DropPosition | null,
  targetId: string,
) => Promise<void> | void;

type OnLongHoverCallback = () => Promise<void> | void;

type UseDroppableArgs = {
  types: string | string[];
  id: string;
  onDrop: OnDropCallback;
  onLongHover?: OnLongHoverCallback;
  // When true, hovering the middle of the row yields 'on' (drop onto
  // this item) in addition to 'top'/'bottom' (drop near it). Used for
  // group rows, which can be nested into as well as reordered; category
  // rows can't have children, so they stick to the plain 'top'/'bottom'
  // behavior.
  allowNestDrop?: boolean;
};

export function useDroppable<T extends { id: string }>({
  types,
  id,
  onDrop,
  onLongHover,
  allowNestDrop = false,
}: UseDroppableArgs) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onLongHoverRef = useRef(onLongHover);
  const [dropPos, setDropPos] = useState<DropPosition | null>(null);

  const [{ isOver }, dropRef] = useDrop<
    { item: T },
    unknown,
    { isOver: boolean }
  >({
    accept: types,
    drop({ item }) {
      void onDrop(item.id, dropPos, id);
    },
    hover(_, monitor) {
      if (!ref.current) return;
      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;
      const hoverHeight = hoverBoundingRect.bottom - hoverBoundingRect.top;
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;

      let pos: DropPosition;
      if (allowNestDrop) {
        const topBoundary = hoverHeight * 0.25;
        const bottomBoundary = hoverHeight * 0.75;
        if (hoverClientY < topBoundary) {
          pos = 'top';
        } else if (hoverClientY > bottomBoundary) {
          pos = 'bottom';
        } else {
          pos = 'on';
        }
      } else {
        const hoverMiddleY = hoverHeight / 2;
        pos = hoverClientY < hoverMiddleY ? 'top' : 'bottom';
      }

      setDropPos(pos);
    },
    collect(monitor) {
      return { isOver: monitor.isOver() };
    },
  });
  const handleDropRef = useDragRef(dropRef);

  useEffect(() => {
    onLongHoverRef.current = onLongHover;
  }, [onLongHover]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    if (onLongHoverRef.current && isOver) {
      timeout = setTimeout(() => onLongHoverRef.current?.(), 700);
    }

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [isOver]);

  return {
    dropRef: useMergedRefs(handleDropRef, ref),
    dropPos: isOver ? dropPos : null,
  };
}

type ItemPosition = 'first' | 'last' | null;
export const DropHighlightPosContext = createContext<ItemPosition>(null);

type DropHighlightProps = {
  // Supports legacy ('top'/'bottom'/'on') and react-aria
  // ('before'/'after'/'on') positions.
  pos: DropPosition | AriaDropPosition | null;
  offset?: {
    top?: number;
    bottom?: number;
  };
};
export function DropHighlight({ pos, offset }: DropHighlightProps) {
  const itemPos = useContext(DropHighlightPosContext);

  if (pos == null) {
    return null;
  }

  if (pos === 'on') {
    return (
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: 4,
          border: `2px solid ${theme.pageTextLink}`,
          zIndex: 10000,
          pointerEvents: 'none',
        }}
      />
    );
  }

  const topOffset = (itemPos === 'first' ? 2 : 0) + (offset?.top || 0);
  const bottomOffset = (itemPos === 'last' ? 2 : 0) + (offset?.bottom || 0);

  // Support both legacy ('top'/'bottom') and aria ('before'/'after') position names
  const isTop = pos === 'top' || pos === 'before';
  const posStyle = isTop ? { top: topOffset } : { bottom: bottomOffset };

  return (
    <View
      style={{
        position: 'absolute',
        left: 2,
        right: 2,
        borderRadius: 3,
        height: 3,
        background: theme.pageTextLink,
        zIndex: 10000,
        pointerEvents: 'none',
        ...posStyle,
      }}
    />
  );
}
