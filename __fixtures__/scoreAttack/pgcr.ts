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

export const successfulPvpPgcrWithTeams = {
  period: "2026-07-05T20:00:00Z",
  activityDetails: {
    instanceId: "pgcr-200",
    referenceId: 654321,
    directorActivityHash: 814159553,
    mode: 10,
    modes: [5, 10],
  },
  teams: [
    { teamId: 1, standing: 0, score: 150, teamName: "Alpha" },
    { teamId: 2, standing: 1, score: 90, teamName: "Bravo" },
  ],
  entries: [
    {
      characterId: "char-alpha",
      standing: 0,
      player: {
        destinyUserInfo: {
          membershipId: "4611686018429000001",
          membershipType: 3,
          displayName: "RunnerOne",
        },
      },
      values: {
        kills: { basic: { value: 28 } },
        assists: { basic: { value: 5 } },
        deaths: { basic: { value: 0 } },
        precisionKills: { basic: { value: 9 } },
        weaponKillsSuper: { basic: { value: 0 } },
        weaponKillsGrenade: { basic: { value: 0 } },
        weaponKillsMelee: { basic: { value: 0 } },
        team: { basic: { value: 1 } },
        standing: { basic: { value: 0 } },
        score: { basic: { value: 150 } },
        activityDurationSeconds: { basic: { value: 600 } },
        completed: { basic: { value: 1 } },
      },
      extended: {
        weapons: [
          {
            referenceId: 2001,
            weaponType: "Pulse Rifle",
            values: {
              uniqueWeaponKills: { basic: { value: 20 } },
              uniqueWeaponPrecisionKills: { basic: { value: 7 } },
            },
          },
          {
            referenceId: 2002,
            weaponType: "Shotgun",
            values: {
              uniqueWeaponKills: { basic: { value: 8 } },
              uniqueWeaponPrecisionKills: { basic: { value: 0 } },
            },
          },
        ],
        scoreboardValues: {
          SeventhColumn: { basic: { value: 1 } },
          captures: { basic: { value: 5 } },
        },
      },
    },
    {
      characterId: "char-bravo",
      standing: 0,
      player: {
        destinyUserInfo: {
          membershipId: "4611686018429000002",
          membershipType: 3,
          displayName: "RunnerTwo",
        },
      },
      values: {
        kills: { basic: { value: 14 } },
        assists: { basic: { value: 6 } },
        deaths: { basic: { value: 4 } },
        precisionKills: { basic: { value: 3 } },
        weaponKillsSuper: { basic: { value: 1 } },
        weaponKillsGrenade: { basic: { value: 0 } },
        weaponKillsMelee: { basic: { value: 0 } },
        team: { basic: { value: 1 } },
        standing: { basic: { value: 0 } },
        score: { basic: { value: 110 } },
        activityDurationSeconds: { basic: { value: 600 } },
        completed: { basic: { value: 1 } },
      },
      extended: {
        weapons: [
          {
            referenceId: 2003,
            weaponType: "Auto Rifle",
            values: {
              uniqueWeaponKills: { basic: { value: 13 } },
              uniqueWeaponPrecisionKills: { basic: { value: 3 } },
            },
          },
        ],
        scoreboardValues: {
          captures: { basic: { value: 2 } },
        },
      },
    },
    {
      characterId: "char-charlie",
      standing: 1,
      player: {
        destinyUserInfo: {
          membershipId: "4611686018429000003",
          membershipType: 3,
          displayName: "RunnerThree",
        },
      },
      values: {
        kills: { basic: { value: 9 } },
        assists: { basic: { value: 4 } },
        deaths: { basic: { value: 8 } },
        precisionKills: { basic: { value: 1 } },
        weaponKillsSuper: { basic: { value: 0 } },
        weaponKillsGrenade: { basic: { value: 1 } },
        weaponKillsMelee: { basic: { value: 0 } },
        team: { basic: { value: 2 } },
        standing: { basic: { value: 1 } },
        score: { basic: { value: 90 } },
        activityDurationSeconds: { basic: { value: 600 } },
        completed: { basic: { value: 1 } },
      },
      extended: {
        weapons: [
          {
            referenceId: 2004,
            weaponType: "Scout Rifle",
            values: {
              uniqueWeaponKills: { basic: { value: 9 } },
              uniqueWeaponPrecisionKills: { basic: { value: 1 } },
            },
          },
        ],
        scoreboardValues: {
          captures: { basic: { value: 1 } },
        },
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
