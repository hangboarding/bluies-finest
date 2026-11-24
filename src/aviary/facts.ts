// Four things worth knowing about each week's bird, shown one at a time under "Bird of the week".
import type { SpeciesId } from '../lib/flock';

export const FACTS: Record<SpeciesId, [string, string, string, string]> = {
  currawong: [
    'Named after its call: a loud, ringing “curra-wong”.',
    'Like an owl, it coughs up pellets of the seeds and bones it can’t digest.',
    'Garden berries like privet feed it through winter, and it spreads those weeds through the bush.',
    'In winter, noisy flocks come down from the high country to lower, warmer ground.',
  ],
  galah: [
    '“Galah” comes from gilaa, its name in the Yuwaalaraay language of northern NSW.',
    'Call someone a galah and you’re calling them a bit of a fool.',
    'When it rains, galahs hang upside down from branches and wires, wings spread, to shower.',
    'Once mostly an inland bird, it spread to the coast as farms brought grain and water.',
  ],
  kingparrot: [
    'Only adult males have the red head; young males stay green like the females for a couple of years.',
    'Its closest relatives, the other king parrots, live in New Guinea and Indonesia.',
    'Around mountain picnic spots, the boldest will land on a shoulder looking for a handout.',
    'It flies fast and low through the forest, calling a shrill “carrack, carrack”.',
  ],
  cockatoo: [
    'Sydney’s cockies have learned to flip open wheelie bins, and the trick has spread from suburb to suburb.',
    'While a flock feeds on the ground, a few keep watch from the trees and screech at any danger.',
    'They can live for decades: some kept birds have passed 60.',
    'A cockatoo called Snowball became famous for dancing in time to music.',
  ],
  rosella: [
    'Named after Rose Hill (now Parramatta), where early colonists first saw them.',
    'Escaped cage birds started a wild population in New Zealand, where it still thrives.',
    'Where they meet, eastern and crimson rosellas sometimes pair up and raise hybrid young.',
    'It loves open grassy country, so parks and golf courses suit it nicely.',
  ],
  magpie: [
    'Groups carol together in one of the most complex songs of any songbird.',
    'Magpies can recognise individual people, and remember who’s been kind to them.',
    'Only a small share of males swoop, and only in spring, to guard their nests.',
    'It isn’t related to the European magpie: its relatives are butcherbirds and currawongs.',
  ],
  raven: [
    'Australia has three kinds of raven and two kinds of crow, and most people call all five “crows”.',
    'For the Kulin peoples of Victoria, Waa the crow is one of two great ancestors, with Bunjil the eagle.',
    'Young ravens roam in gangs for years before pairing up and claiming a territory of their own.',
    'Its “aah-aah-aaaah”, the last note trailing off, is how to tell it from a crow.',
  ],
  woodduck: [
    'Also called the maned duck, after the dark mane on the back of the male’s head.',
    'It nests in tree hollows, and the ducklings jump to the ground soon after hatching.',
    'It grazes on grass more than it swims, often around farm dams and lawns.',
    'It has done well from farming: every new farm dam gives it more room.',
  ],
  crimsonrosella: [
    'Young ones in the mountains are mostly green, and turn crimson over their first year or so.',
    'The yellow rosella of the Murray and the Adelaide rosella are the same species.',
    'It was taken to Norfolk Island, where it now lives wild.',
    'It nests in tree hollows, which can take a gum tree a hundred years or more to form.',
  ],
  wattlebird: [
    'Named after the red, fleshy wattles hanging from its cheeks.',
    'It’s the largest honeyeater on the mainland.',
    'It’s bossy: it chases other birds away from trees in flower.',
    'Its brush-tipped tongue mops up nectar, pollinating grevilleas and banksias as it feeds.',
  ],
};
