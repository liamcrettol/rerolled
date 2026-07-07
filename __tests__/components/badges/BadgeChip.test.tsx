import { render, screen } from "@testing-library/react";
import BadgeChip from "@/components/badges/BadgeChip";

describe("BadgeChip", () => {
  it("shows the visible label at full/compact/tiny sizes", () => {
    render(
      <BadgeChip name="Drawn" description="Complete your first activity." tier="bronze" mode="core" iconKey="laurel" size="full" />
    );
    expect(screen.getByText("Drawn")).toBeInTheDocument();
  });

  it("hides the visible label at icon size but keeps the name+description accessible", () => {
    const { container } = render(
      <BadgeChip name="Drawn" description="Complete your first activity." tier="bronze" mode="core" iconKey="laurel" size="icon" />
    );
    expect(screen.queryByText("Drawn")).not.toBeInTheDocument();
    expect(container.querySelector(".sr-only")?.textContent).toBe("Drawn. Complete your first activity.");
  });

  it("prefixes the accessible text for a locked icon-size chip", () => {
    const { container } = render(
      <BadgeChip
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
});
