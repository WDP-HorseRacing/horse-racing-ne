import { horseListDisplay } from './horse-list-display';

describe('horseListDisplay', () => {
  const briefs = new Map([
    ['h1', { name: 'Gió', mediaId: 'm1' }],
    ['h2', { name: 'Bão', mediaId: null }],
    ['h3', { name: 'Mây', mediaId: 'm3' }],
  ]);
  const urls = new Map([['m1', 'https://signed/m1']]);

  it('returns the signed photo url of the horse', () => {
    expect(horseListDisplay('h1', briefs, urls)).toEqual({
      horseName: 'Gió',
      horsePhotoUrl: 'https://signed/m1',
    });
  });

  it('returns null photo when the horse has no media or it was not signed', () => {
    expect(horseListDisplay('h2', briefs, urls).horsePhotoUrl).toBeNull();
    expect(horseListDisplay('h3', briefs, urls).horsePhotoUrl).toBeNull();
  });
});
