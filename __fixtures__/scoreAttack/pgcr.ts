export const successfulPvePgcrWithWeapons = {
  period: "2026-07-05T18:00:00Z",
  activityDetails: {
    instanceId: "pgcr-100",
    referenceId: 123456,
    mode: 4,
    modes: [4, 7],
  },
  entries: [
    {
      characterId: "char-alpha",
      player: {
        destinyUserInfo: {
          membershipId: "4611686018429000001",
          membershipType: 3,
          displayName: "RunnerOne",
        },
      },
      values: {
        kills: { basic: { value: 100 } },
        assists: { basic: { value: 20 } },
        deaths: { basic: { value: 2 } },
        precisionKills: { basic: { value: 30 } },
        weaponKillsSuper: { basic: { value: 7 } },
        weaponKillsGrenade: { basic: { value: 5 } },
        weaponKillsMelee: { basic: { value: 4 } },
        activityDurationSeconds: { basic: { value: 720 } },
        completed: { basic: { value: 1 } },
      },
      extended: {
        weapons: [
          {
            referenceId: 1001,
            weaponType: "Auto Rifle",
            values: {
              uniqueWeaponKills: { basic: { value: 70 } },
              uniqueWeaponPrecisionKills: { basic: { value: 20 } },
            },
          },
          {
            referenceId: 1002,
            weaponType: "Sidearm",
            values: {
              uniqueWeaponKills: { basic: { value: 20 } },
              uniqueWeaponPrecisionKills: { basic: { value: 6 } },
            },
          },
          {
            referenceId: 9001,
            weaponType: "Grenade Launcher",
            values: {
              uniqueWeaponKills: { basic: { value: 10 } },
              uniqueWeaponPrecisionKills: { basic: { value: 0 } },
            },
          },
        ],
      },
    },
    {
      characterId: "char-bravo",
      player: {
        destinyUserInfo: {
          membershipId: "4611686018429000002",
          membershipType: 3,
          displayName: "RunnerTwo",
        },
      },
      values: {
        kills: { basic: { value: 40 } },
        assists: { basic: { value: 8 } },
        deaths: { basic: { value: 3 } },
        precisionKills: { basic: { value: 12 } },
        activityDurationSeconds: { basic: { value: 715 } },
        completed: { basic: { value: 1 } },
      },
      extended: {
        weapons: [
          {
            referenceId: 1001,
            weaponType: "Auto Rifle",
            values: {
              uniqueWeaponKills: { basic: { value: 30 } },
              uniqueWeaponPrecisionKills: { basic: { value: 8 } },
            },
          },
        ],
      },
    },
  ],
};

export const missingWeaponDataPgcr = {
  period: "2026-07-05T18:00:00Z",
  activityDetails: {
    instanceId: "pgcr-101",
    referenceId: 123456,
    mode: 4,
  },
  entries: [
    {
      characterId: "char-alpha",
      player: {
        destinyUserInfo: {
          membershipId: "4611686018429000001",
          membershipType: 3,
          displayName: "RunnerOne",
        },
      },
      values: {
        kills: { basic: { value: 25 } },
        assists: { basic: { value: 4 } },
        deaths: { basic: { value: 1 } },
        activityDurationSeconds: { basic: { value: 800 } },
        completed: { basic: { value: 1 } },
      },
    },
  ],
};

export const incompleteUnsupportedPgcr = {
  period: "2026-07-05T18:00:00Z",
  completed: false,
  activityDetails: {
    instanceId: "pgcr-102",
    referenceId: 999999,
    mode: 0,
  },
  entries: [],
};

export const multiCharacterPgcr = {
  period: "2026-07-05T19:00:00Z",
  activityDetails: {
    instanceId: "pgcr-103",
    referenceId: 222222,
    mode: 4,
  },
  entries: [
    {
      characterId: "char-alpha",
      player: {
        destinyUserInfo: {
          membershipId: "4611686018429000001",
          membershipType: 3,
          displayName: "RunnerOne",
        },
      },
      values: {
        kills: { basic: { value: 10 } },
        deaths: { basic: { value: 1 } },
        completed: { basic: { value: 1 } },
      },
      extended: {
        weapons: [
          {
            referenceId: 1001,
            values: {
              uniqueWeaponKills: { basic: { value: 7 } },
              uniqueWeaponPrecisionKills: { basic: { value: 2 } },
            },
          },
        ],
      },
    },
    {
      characterId: "char-beta",
      player: {
        destinyUserInfo: {
          membershipId: "4611686018429000001",
          membershipType: 3,
          displayName: "RunnerOne",
        },
      },
      values: {
        kills: { basic: { value: 5 } },
        deaths: { basic: { value: 0 } },
        completed: { basic: { value: 1 } },
      },
      extended: {
        weapons: [
          {
            referenceId: 1001,
            values: {
              uniqueWeaponKills: { basic: { value: 3 } },
              uniqueWeaponPrecisionKills: { basic: { value: 1 } },
            },
          },
          {
            referenceId: 1003,
            values: {
              uniqueWeaponKills: { basic: { value: 2 } },
            },
          },
        ],
      },
    },
  ],
};
