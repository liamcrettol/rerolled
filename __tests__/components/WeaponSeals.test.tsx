import { render, screen } from "@testing-library/react";
import WeaponSeals from "@/components/WeaponSeals";

describe("WeaponSeals", () => {
  it("renders no seals when all are false", () => {
    const { container } = render(
      <WeaponSeals
        seals={{
          isInLoadout: false,
          isInYourRoll: false,
          isInFireteamRoll: false,
        }}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders loadout seal when isInLoadout is true", () => {
    render(
      <WeaponSeals
        seals={{
          isInLoadout: true,
          isInYourRoll: false,
          isInFireteamRoll: false,
        }}
      />
    );
    expect(screen.getByTitle("Currently equipped in your loadout")).toBeInTheDocument();
  });

  it("renders your roll seal when isInYourRoll is true", () => {
    render(
      <WeaponSeals
        seals={{
          isInLoadout: false,
          isInYourRoll: true,
          isInFireteamRoll: false,
        }}
      />
    );
    expect(screen.getByTitle("In your current roulette roll")).toBeInTheDocument();
  });

  it("renders team seal when isInFireteamRoll is true", () => {
    render(
      <WeaponSeals
        seals={{
          isInLoadout: false,
          isInYourRoll: false,
          isInFireteamRoll: true,
        }}
      />
    );
    expect(screen.getByTitle("In a fireteam member's roll")).toBeInTheDocument();
  });

  it("renders all seals when all are true", () => {
    render(
      <WeaponSeals
        seals={{
          isInLoadout: true,
          isInYourRoll: true,
          isInFireteamRoll: true,
        }}
      />
    );
    expect(screen.getByTitle("Currently equipped in your loadout")).toBeInTheDocument();
    expect(screen.getByTitle("In your current roulette roll")).toBeInTheDocument();
    expect(screen.getByTitle("In a fireteam member's roll")).toBeInTheDocument();
  });

  it("renders seals in a flex container with proper spacing", () => {
    render(
      <WeaponSeals
        seals={{
          isInLoadout: true,
          isInYourRoll: true,
          isInFireteamRoll: true,
        }}
      />
    );
    const container = screen.getByTitle("Currently equipped in your loadout").parentElement;
    expect(container).toHaveClass("flex", "gap-1");
  });

  it("displays correct text labels for each seal", () => {
    render(
      <WeaponSeals
        seals={{
          isInLoadout: true,
          isInYourRoll: false,
          isInFireteamRoll: false,
        }}
      />
    );
    expect(screen.getByText("✓ Loadout")).toBeInTheDocument();
  });

  it("displays all seal labels when all seals are true", () => {
    render(
      <WeaponSeals
        seals={{
          isInLoadout: true,
          isInYourRoll: true,
          isInFireteamRoll: true,
        }}
      />
    );
    expect(screen.getByText("✓ Loadout")).toBeInTheDocument();
    expect(screen.getByText("⚡ Your Roll")).toBeInTheDocument();
    expect(screen.getByText("👥 Team")).toBeInTheDocument();
  });
});
