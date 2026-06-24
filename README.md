# Destiny 2 Gun Roulette

Destiny 2 Gun Roulette is a web app for creating random weapon loadouts with friends using the Bungie API.

Users can sign in with their Bungie account, view their Destiny 2 weapons, join a shared lobby, and generate or queue roulette-style weapon loadouts. The app is intended for private group use between matches while players are in orbit.

## Planned Features

- Bungie OAuth sign-in
- Destiny 2 character, inventory, and vault lookup
- Weapon cards with icons, perks, and roll details
- Shared lobby system for friends
- Three-slot loadout queue
- Random weapon selection
- Rotating captain system
- Transfer and equip support through the Bungie API where allowed

## Bungie API Usage

This app uses the Bungie API to read Destiny 2 profile, inventory, vault, and equipment data. With user authorization, it may also move or equip Destiny 2 items.

The app does not store Bungie passwords. Authentication is handled through Bungie OAuth.

## Deployment URLs

### Production
`https://destiny-gun-roulette.vercel.app`

### Development
Local development uses:

`http://localhost:3000/api/auth/callback/bungie`

## Status

Early development / personal project.

## Disclaimer

This project is not affiliated with, endorsed by, sponsored by, or approved by Bungie. Destiny, Destiny 2, and Bungie are trademarks of Bungie, Inc.
