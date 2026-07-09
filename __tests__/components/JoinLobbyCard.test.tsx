import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import JoinLobbyCard from "@/components/platform/JoinLobbyCard";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

const codeInput = () => screen.getByPlaceholderText("LOBBY CODE");
const joinButton = () => screen.getByRole("button", { name: /join/i });

describe("JoinLobbyCard", () => {
  it("renders as a mode tile with no active lobby", () => {
    render(<JoinLobbyCard activeSession={null} />);

    expect(screen.getByText("Enter a code or rejoin")).toBeInTheDocument();
    expect(codeInput()).toBeInTheDocument();
    expect(screen.queryByText("Rejoin")).not.toBeInTheDocument();
  });

  it("offers a rejoin button for an active lobby, routed by its mode", () => {
    render(<JoinLobbyCard activeSession={{ code: "ABC123", status: "waiting", mode: "draft" }} />);

    expect(screen.getByText("ABC123")).toBeInTheDocument();
    expect(screen.getByText("Waiting for players")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Rejoin"));
    // A draft lobby lives on /draft, not /lobby.
    expect(push).toHaveBeenCalledWith("/draft/ABC123");
  });

  it("routes an endgame rejoin to the endgame board", () => {
    render(<JoinLobbyCard activeSession={{ code: "XYZ789", status: "in_game", mode: "endgame" }} />);
    fireEvent.click(screen.getByText("Rejoin"));
    expect(push).toHaveBeenCalledWith("/endgame/lobby/XYZ789");
  });

  it("uppercases and strips whitespace from a typed code", () => {
    render(<JoinLobbyCard activeSession={null} />);
    fireEvent.change(codeInput(), { target: { value: " ab c1 " } });
    expect(codeInput()).toHaveValue("ABC1");
  });

  it("keeps Join disabled until a code is typed", () => {
    render(<JoinLobbyCard activeSession={null} />);
    expect(joinButton()).toBeDisabled();

    fireEvent.change(codeInput(), { target: { value: "ABC123" } });
    expect(joinButton()).toBeEnabled();
  });

  it("sends the player to the board the API says the lobby lives on", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ code: "ABC123", mode: "endgame" }),
    });

    render(<JoinLobbyCard activeSession={null} />);
    fireEvent.change(codeInput(), { target: { value: "ABC123" } });
    fireEvent.click(joinButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/endgame/lobby/ABC123"));
  });

  it("surfaces a join failure instead of navigating", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Lobby not found" }),
    });

    render(<JoinLobbyCard activeSession={null} />);
    fireEvent.change(codeInput(), { target: { value: "NOPE" } });
    fireEvent.click(joinButton());

    expect(await screen.findByText("Lobby not found")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
