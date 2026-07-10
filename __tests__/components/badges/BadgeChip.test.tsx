import { render, screen } from "@testing-library/react";
import BadgeChip from "@/components/badges/BadgeChip";

describe("BadgeChip", () => {
  it("shows the visible label at full/compact/tiny sizes", () => {
    render(
      <BadgeChip slug="core_drawn" name="Drawn" description="Complete your first activity." tier="bronze" mode="core" iconKey="laurel" size="full" />
    );
    expect(screen.getByText("Drawn")).toBeInTheDocument();
  });

  it("hides the visible label at icon size but keeps the name+description accessible", () => {
    const { container } = render(
      <BadgeChip slug="core_drawn" name="Drawn" description="Complete your first activity." tier="bronze" mode="core" iconKey="laurel" size="icon" />
    );
    expect(screen.queryByText("Drawn")).not.toBeInTheDocument();
    expect(container.querySelector(".sr-only")?.textContent).toBe("Drawn. Complete your first activity.");
  });

  it("prefixes the accessible text for a locked icon-size chip", () => {
    const { container } = render(
      <BadgeChip
        slug="crucible_writ"
        name="Crucible Writ"
        description="Win a Crucible match."
        tier="bronze"
        mode="crucible"
        iconKey="laurel"
        size="icon"
        locked
      />
    );
    expect(container.querySelector(".sr-only")?.textContent).toBe("Not yet earned. Win a Crucible match.");
  });

  it("renders the bespoke SVG for a registered slug at full size, skipping the generic frame", () => {
    const { container } = render(
      <BadgeChip
        slug="trials_lighthouse_writ"
        name="Immaculate"
        description="Go without a loss on your card."
        tier="platinum"
        mode="trials"
        iconKey="ring"
        size="full"
      />
    );
    expect(screen.getByText("IMMACULATE")).toBeInTheDocument();
    expect(screen.queryByText("Immaculate")).not.toBeInTheDocument();
    expect(container.querySelector(".sr-only")?.textContent).toBe(
      "Immaculate. Go without a loss on your card."
    );
  });

  it("falls back to the generic frame for a bespoke slug at a non-full size", () => {
    render(
      <BadgeChip
        slug="trials_lighthouse_writ"
        name="Immaculate"
        description="Go without a loss on your card."
        tier="platinum"
        mode="trials"
        iconKey="ring"
        size="compact"
      />
    );
    expect(screen.getByText("Immaculate")).toBeInTheDocument();
    expect(screen.queryByText("IMMACULATE")).not.toBeInTheDocument();
  });

  it("dims and grayscales a locked bespoke badge the same way as the generic frame", () => {
    const { container } = render(
      <BadgeChip
        slug="trials_lighthouse_writ"
        name="Immaculate"
        description="Go Flawless."
        tier="platinum"
        mode="trials"
        iconKey="ring"
        size="full"
        locked
      />
    );
    expect(container.querySelector(".opacity-45.grayscale")).toBeInTheDocument();
  });

  it("renders the Developer bespoke badge in the full Badge Case size", () => {
    const { container } = render(
      <BadgeChip
        slug="status_developer"
        name="Developer"
        description="Project maintainer."
        tier="special"
        mode="status_legacy"
        iconKey="status"
        size="full"
      />
    );

    expect(screen.getByText("DEVELOPER")).toBeInTheDocument();
    expect(screen.queryByText("Developer")).not.toBeInTheDocument();
    expect(container.querySelector(".sr-only")?.textContent).toBe("Developer. Project maintainer.");
  });

  it("renders the compact Developer mark for icon-only player cards", () => {
    const { container } = render(
      <BadgeChip
        slug="status_developer"
        name="Developer"
        description="Project maintainer."
        tier="special"
        mode="status_legacy"
        iconKey="status"
        size="icon"
      />
    );

    expect(screen.getByRole("img", { name: "Developer badge mark" })).toBeInTheDocument();
    expect(container.querySelector(".sr-only")?.textContent).toBe("Developer. Project maintainer.");
  });

  it("renders the Founder bespoke badge in the full Badge Case size", () => {
    const { container } = render(
      <BadgeChip
        slug="status_founder"
        name="Founder"
        description="Played during closed beta or the early launch window."
        tier="special"
        mode="status_legacy"
        iconKey="status"
        size="full"
      />
    );

    expect(screen.getByText("FOUNDER")).toBeInTheDocument();
    expect(screen.queryByText("Founder")).not.toBeInTheDocument();
    expect(container.querySelector(".sr-only")?.textContent).toBe(
      "Founder. Played during closed beta or the early launch window."
    );
  });

  it("renders the compact Founder mark for icon-only player cards", () => {
    const { container } = render(
      <BadgeChip
        slug="status_founder"
        name="Founder"
        description="Played during closed beta or the early launch window."
        tier="special"
        mode="status_legacy"
        iconKey="status"
        size="icon"
      />
    );

    expect(screen.getByRole("img", { name: "Founder badge mark" })).toBeInTheDocument();
    expect(container.querySelector(".sr-only")?.textContent).toBe(
      "Founder. Played during closed beta or the early launch window."
    );
  });
});
