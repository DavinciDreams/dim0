// Timeline event cards and the hover preview. A card is drawn at its design size
// (CARD_WIDTH × cardHeight) and scaled by its depth, so the layout's size estimate
// is exactly what's painted. All text is rendered as text nodes.

import { memo, type CSSProperties, type Ref } from "react"

import { cn } from "@/lib/utils"

import { cssColor, fontStack, tint, type Ink } from "./colors"
import { CARD_WIDTH, STEM_INSET, effectiveStyle, noteLines, titleLines, type PlacedCard } from "./layout"
import type { TimelineEvent } from "./model"


const IMAGE_HEIGHT = 96
/** Lift from the stem's foot, so a hovered card grows away from its stem. */
const LIFT_ORIGIN = `${(STEM_INSET / CARD_WIDTH) * 100}% 100%`


function clampStyle(lines: number): CSSProperties {
  return { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines, overflow: "hidden" }
}


interface CardImageProps {
  url: string
  height?: number
  className?: string
  onSettled: (url: string, ok: boolean) => void
}


/** A card image. No crossOrigin: images without CORS still display, and snapDOM
 *  substitutes a placeholder for any it cannot inline, so capture never breaks. */
function CardImage({ url, height, className, onSettled }: CardImageProps) {
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      decoding="async"
      referrerPolicy="no-referrer"
      className={cn("block w-full object-cover", className)}
      style={height ? { height } : undefined}
      onLoad={() => onSettled(url, true)}
      onError={() => onSettled(url, false)}
    />
  )
}


export interface TimelineCardProps {
  event: TimelineEvent
  placed: PlacedCard
  /** Screen left/top (layout position + pan). */
  left: number
  top: number
  color: string
  ink: Ink
  dateText: string
  /** Hovered or keyboard-focused: lifted forward, haze removed. */
  active: boolean
  selected: boolean
  tabbable: boolean
  showImage: boolean
  buttonRef: Ref<HTMLButtonElement>
  describedBy?: string
  onHover: (id: string | null) => void
  onOpen: (id: string) => void
  onFocusCard: (id: string) => void
  onBlurCard: () => void
  onImageSettled: (url: string, ok: boolean) => void
}


type CardBodyProps = Pick<TimelineCardProps, "event" | "color" | "ink" | "dateText" | "showImage" | "onImageSettled">


/** The card face. Memoized: panning moves the card but never changes its face. */
const CardBody = memo(function CardBody({ event, color, ink, dateText, showImage, onImageSettled }: CardBodyProps) {
  const style = effectiveStyle({ style: event.style.card ?? "classic", hasImage: showImage })
  const fill = cssColor(color)
  const lines = titleLines(event.title)
  const image = showImage && event.media ? event.media.url : null
  switch (style) {
    case "image":
      return (
        <div className="relative h-full overflow-hidden rounded-md border-b-4 bg-muted" style={{ borderBottomColor: fill }}>
          {image && <CardImage url={image} className="absolute inset-0 h-full" onSettled={onImageSettled} />}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-2 pt-6 pb-1.5 text-white">
            <div className="text-[13px] font-semibold leading-4" style={clampStyle(2)}>{event.title}</div>
            <div className="truncate text-[11px] leading-4 text-white/80">{event.subtitle ?? dateText}</div>
          </div>
        </div>
      )
    case "note":
      return (
        <div className="flex h-full flex-col rounded-sm border-t-4 shadow-sm" style={{ borderTopColor: fill, background: tint(color, 14) }}>
          <div className="px-2.5 py-1.5 text-[13px] font-semibold leading-4 text-card-foreground" style={clampStyle(lines)}>{event.title}</div>
          {event.subtitle && <div className="truncate px-2.5 text-[11px] leading-5 text-muted-foreground">{event.subtitle}</div>}
          {event.description && (
            <div className="px-2.5 pb-1.5 text-[11px] leading-[15px] text-card-foreground/90" style={clampStyle(noteLines(event.description))}>
              {event.description}
            </div>
          )}
          <div className="mt-auto truncate px-2.5 text-[11px] leading-5 text-muted-foreground">{dateText}</div>
        </div>
      )
    case "rounded":
      return (
        <div className="flex h-full flex-col rounded-2xl border-2 bg-card p-1.5 text-card-foreground" style={{ borderColor: fill }}>
          {image && <CardImage url={image} height={IMAGE_HEIGHT - 8} className="mb-1.5 rounded-xl" onSettled={onImageSettled} />}
          <div className="rounded-full px-3 py-1.5 text-[13px] font-semibold leading-4" style={{ background: fill, color: ink }}>
            <span style={clampStyle(lines)}>{event.title}</span>
          </div>
          {event.subtitle && <div className="truncate px-2 text-[11px] leading-5">{event.subtitle}</div>}
          <div className="truncate px-2 text-[11px] leading-5 text-muted-foreground">{dateText}</div>
        </div>
      )
    case "dark":
      return (
        <div className="flex h-full flex-col overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 text-neutral-50">
          {image && <CardImage url={image} height={IMAGE_HEIGHT} onSettled={onImageSettled} />}
          <div className="border-l-4 px-2 py-1.5 text-[13px] font-semibold leading-4" style={{ borderLeftColor: fill }}>
            <span style={clampStyle(lines)}>{event.title}</span>
          </div>
          {event.subtitle && <div className="truncate bg-neutral-800 px-2 text-[11px] leading-5 text-neutral-300">{event.subtitle}</div>}
          <div className="truncate px-2 text-[11px] leading-5 text-neutral-400">{dateText}</div>
        </div>
      )
    case "classic":
      return (
        <div className="flex h-full flex-col overflow-hidden rounded-md border bg-card text-card-foreground" style={{ borderColor: fill }}>
          {image && <CardImage url={image} height={IMAGE_HEIGHT} onSettled={onImageSettled} />}
          <div className="px-2 py-1.5 text-[13px] font-semibold leading-4" style={{ background: fill, color: ink }}>
            <span style={clampStyle(lines)}>{event.title}</span>
          </div>
          {event.subtitle && (
            <div className="truncate px-2 text-[11px] leading-5" style={{ background: tint(color, 22) }}>
              {event.subtitle}
            </div>
          )}
          <div className="truncate px-2 text-[11px] leading-5 text-muted-foreground">{dateText}</div>
        </div>
      )
  }
})


/** One event card on its stem. Positioned in stage pixels, scaled by depth. */
export const TimelineCard = memo(function TimelineCard(props: TimelineCardProps) {
  const { event, placed, left, top, active, selected, tabbable, buttonRef, describedBy, onHover, onOpen, onFocusCard, onBlurCard } = props
  return (
    <div
      className="absolute top-0 left-0"
      style={{
        width: CARD_WIDTH,
        height: placed.height / placed.scale,
        transform: `translate(${left}px, ${top}px) scale(${placed.scale})`,
        transformOrigin: "0 0",
        zIndex: active ? 100_000 : placed.zIndex,
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        data-event-id={event.id}
        data-active={active ? "true" : "false"}
        tabIndex={tabbable ? 0 : -1}
        aria-label={`${event.title}, ${props.dateText}`}
        aria-describedby={describedBy}
        aria-haspopup="dialog"
        className={cn(
          "relative block h-full w-full cursor-pointer rounded-md text-left outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          selected && "ring-2 ring-ring",
        )}
        style={{ fontFamily: fontStack(event.style.font) }}
        onPointerEnter={() => onHover(event.id)}
        onPointerLeave={() => onHover(null)}
        onFocus={() => onFocusCard(event.id)}
        onBlur={onBlurCard}
        onClick={() => onOpen(event.id)}
      >
        {/* The lift is on an inner layer so the hit area stays put (no hover flicker). */}
        <span
          className={cn(
            "relative block h-full rounded-md transition-[transform,box-shadow] duration-150 ease-out",
            placed.depth < 0.3 ? "shadow-md" : "shadow-sm",
            active && "-translate-y-2 scale-[1.06] shadow-xl",
          )}
          style={{ transformOrigin: LIFT_ORIGIN }}
        >
          <CardBody event={event} color={props.color} ink={props.ink} dateText={props.dateText} showImage={props.showImage} onImageSettled={props.onImageSettled} />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-md bg-background transition-opacity duration-150"
            style={{ opacity: active ? 0 : placed.fog }}
          />
        </span>
      </button>
    </div>
  )
})


export interface HoverPreviewProps {
  id: string
  event: TimelineEvent
  dateText: string
  color: string
  /** The card's screen box. */
  box: { left: number; top: number; width: number; height: number }
  stageWidth: number
  stageHeight: number
}


/** The short summary shown while a card is hovered or focused. */
export function HoverPreview({ id, event, dateText, color, box, stageWidth, stageHeight }: HoverPreviewProps) {
  const width = Math.min(260, stageWidth - 16)
  const left = Math.max(8, Math.min(box.left, stageWidth - width - 8))
  const above = box.top > 130
  const summary = event.description ? Array.from(event.description).slice(0, 240).join("") : ""
  return (
    <div
      id={id}
      role="tooltip"
      className="pointer-events-none absolute z-[200000] rounded-lg border bg-popover p-2.5 text-popover-foreground shadow-xl"
      style={above ? { left, width, bottom: stageHeight - box.top + 8 } : { left, width, top: box.top + box.height + 8 }}
    >
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: cssColor(color) }} />
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-5">{event.title}</div>
          <div className="text-xs text-muted-foreground">{dateText}</div>
        </div>
      </div>
      {event.subtitle && <div className="mt-1 text-xs font-medium">{event.subtitle}</div>}
      {summary && (
        <p className="mt-1.5 text-xs leading-[18px] whitespace-pre-line text-muted-foreground" style={clampStyle(4)}>
          {summary}
        </p>
      )}
      <div className="mt-1.5 text-[11px] text-muted-foreground/80">Click for details</div>
    </div>
  )
}
