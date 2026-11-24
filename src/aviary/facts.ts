// Four things worth knowing about each week's bird, shown one at a time under "Bird of the week".
import type { SpeciesId } from '../lib/flock';

export const FACTS: Record<SpeciesId, [string, string, string, string]> = {
  currawong: [
    'Named after its call: a loud, ringing “curra-wong”.',
    'That bright yellow eye is how you tell it from a raven at a glance.',
    'In winter many leave the high country for lower, warmer ground, often in noisy flocks.',
    'It eats insects and fruit, but also raids other birds’ nests for eggs and chicks.',
  ],
  galah: [
    '“Galah” comes from gilaa, its name in the Yuwaalaraay language of northern NSW.',
    'You can tell them apart by the eye: females have pinkish-red eyes, males dark brown.',
    'Pairs stay together for years, often for life.',
    'Call someone a galah and you’re calling them a bit of a fool.',
  ],
  kingparrot: [
    'Only the adult male has the all-red head; females and young birds have green heads.',
    'They live in the forests of the east coast and ranges, the Blue Mountains included.',
    'They feed on seeds, fruit, berries and blossom, mostly up in the trees.',
    'Listen for a shrill “carrack, carrack” and a high, piping whistle.',
  ],
  cockatoo: [
    'Sydney’s cockies have learned to flip open wheelie bins, and the trick has spread from suburb to suburb.',
    'While a flock feeds on the ground, a few keep watch from the trees and screech at any danger.',
    'They can live for decades: some kept birds have passed 60.',
    'A cockatoo called Snowball became famous for dancing in time to music.',
  ],
  rosella: [
    'Named after Rose Hill (now Parramatta), where early colonists first saw them.',
    'White cheeks set it apart from the crimson rosella, which has blue ones.',
    'It feeds mostly on the ground, on grass seeds, fruit, flowers and insects.',
    'Listen for a ringing “pink-pink” and a rising whistle.',
  ],
  magpie: [
    'Groups carol together in one of the most complex songs of any songbird.',
    'Magpies can recognise individual people, and remember who’s been kind to them.',
    'Only a small share of males swoop, and only in spring, to guard their nests.',
    'It isn’t related to the European magpie: its relatives are butcherbirds and currawongs.',
  ],
  raven: [
    'Adults have white eyes; young ravens’ eyes start out brown.',
    'Its call is a slow “aah-aah-aaaah”, the last note trailing away.',
    'When it calls, it puffs out the shaggy feathers on its throat.',
    'Pairs stay together and hold the same territory for years.',
  ],
  woodduck: [
    'Also called the maned duck, after the dark mane on the back of the male’s head.',
    'It nests in tree hollows, and the ducklings jump to the ground soon after hatching.',
    'It grazes on grass more than it swims, often around farm dams and lawns.',
    'Its call is a long, nasal, rising “mew”.',
  ],
  crimsonrosella: [
    'Young ones in the mountains are mostly green, and turn crimson over their first year or so.',
    'Blue cheeks set it apart from the eastern rosella, which has white ones.',
    'The yellow rosella of the Murray and the Adelaide rosella are the same species.',
    'It eats seeds, fruit, blossom and insects, in forests and gardens alike.',
  ],
  wattlebird: [
    'Named after the red, fleshy wattles hanging from its cheeks.',
    'It’s the largest honeyeater on the mainland.',
    'It’s bossy: it chases other birds away from trees in flower.',
    'Besides nectar it eats insects, often snatching them out of the air.',
  ],
};
