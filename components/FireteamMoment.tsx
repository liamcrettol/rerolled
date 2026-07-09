// Caption under the hero row explaining the fireteam-intersection mechanic.
// Used to carry its own duplicate weapon-tile row, but HeroReel right above
// already shows a landed roll - having two "weapon icons" moments back to
// back was redundant, so this is just the pitch now (#... consolidation).
export default function FireteamMoment() {
  return (
    <div className="max-w-md text-center">
      <h2 className="text-xl md:text-2xl font-bold text-white">
        Built from what your fireteam actually owns
      </h2>
    </div>
  );
}
