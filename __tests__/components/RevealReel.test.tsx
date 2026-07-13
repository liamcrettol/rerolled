import { act, render } from "@testing-library/react";
import RevealReel from "@/components/RevealReel";

describe("RevealReel", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("updates immediately when animation is disabled", () => {
    const { container, rerender } = render(
      <RevealReel target="/one.jpg" fillers={["/filler.jpg"]} revealKey={0} itemSize={56} animate={false} />
    );

    rerender(
      <RevealReel target="/two.jpg" fillers={["/filler.jpg"]} revealKey={1} itemSize={56} animate={false} />
    );

    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector("img")).toHaveAttribute("src", "/two.jpg");
  });

  it("scrolls through fillers and reports landing", () => {
    const onSpinningChange = jest.fn();
    const onLanded = jest.fn();
    const { container, rerender } = render(
      <RevealReel target="/one.jpg" fillers={["/a.jpg", "/b.jpg"]} revealKey={0} itemSize={56} />
    );

    rerender(
      <RevealReel
        target="/two.jpg"
        fillers={["/a.jpg", "/b.jpg"]}
        revealKey={1}
        itemSize={56}
        fillerCount={3}
        durationMs={100}
        onSpinningChange={onSpinningChange}
        onLanded={onLanded}
      />
    );

    act(() => jest.advanceTimersByTime(1));
    expect(container.querySelectorAll("img")).toHaveLength(4);
    expect(onSpinningChange).toHaveBeenCalledWith(true);

    act(() => jest.advanceTimersByTime(150));
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector("img")).toHaveAttribute("src", "/two.jpg");
    expect(onSpinningChange).toHaveBeenLastCalledWith(false);
    expect(onLanded).toHaveBeenCalledTimes(1);
  });
});
