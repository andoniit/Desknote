import Image from "next/image";
import { cn } from "@/lib/utils";

const SLIDES = [
  { src: "/Images/newyorkdesk.png", alt: "Desk with a city view" },
  { src: "/Images/mydeskv3.jpg", alt: "Desk setup" },
  { src: "/Images/bedroom.png", alt: "Bedroom desk" },
  { src: "/Images/shelf.png", alt: "Shelf and desk" },
  { src: "/Images/gamingdesk.png", alt: "Gaming desk" },
  { src: "/Images/mydesk.jpg", alt: "Home desk" },
  { src: "/Images/mydeskv2.jpg", alt: "Desk at home" },
] as const;

type HomeImageMarqueeProps = {
  /** Smaller strip for in-flow mobile placement under the hero title. */
  inline?: boolean;
};

/**
 * Horizontal strip for a full-bleed wrapper: two copies of the slide list so
 * `translateX(-50%)` loops seamlessly.
 */
export function HomeImageMarquee({ inline = false }: HomeImageMarqueeProps) {
  return (
    <div
      className={cn(
        "h-full w-full overflow-x-hidden overflow-y-visible [mask-image:linear-gradient(to_right,transparent_0%,black_10%,black_90%,transparent_100%)]",
        inline ? "opacity-[0.72]" : "opacity-[0.48]"
      )}
      aria-hidden
    >
      <div
        className={cn(
          "flex h-full w-max items-center animate-home-marquee will-change-transform",
          inline ? "gap-3 py-3 pr-3" : "gap-5 py-10 pr-5"
        )}
      >
        {[0, 1].map((pass) => (
          <div key={pass} className={cn("flex shrink-0 items-center", inline ? "gap-3" : "gap-5")}>
            {SLIDES.map((img, i) => (
              <div
                key={`${pass}-${i}`}
                className={cn(
                  "relative shrink-0 overflow-hidden rounded-xl border border-white/50 shadow-card sm:rounded-2xl",
                  inline
                    ? "h-28 w-40 sm:h-32 sm:w-44"
                    : "h-48 w-72 sm:h-52 sm:w-80 md:h-56 md:w-[22rem]",
                  // Zigzag: alternate slightly above / below the row center
                  inline
                    ? i % 2 === 0
                      ? "-translate-y-1.5"
                      : "translate-y-1.5"
                    : i % 2 === 0
                      ? "-translate-y-3 sm:-translate-y-4 md:-translate-y-5"
                      : "translate-y-3 sm:translate-y-4 md:translate-y-5"
                )}
              >
                <Image
                  src={img.src}
                  alt=""
                  fill
                  sizes={
                    inline
                      ? "(max-width: 640px) 160px, 176px"
                      : "(max-width: 640px) 288px, (max-width: 1024px) 320px, 352px"
                  }
                  className="object-cover"
                  priority={pass === 0 && i < 2}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
