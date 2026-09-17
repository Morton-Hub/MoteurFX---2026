// MOTORFX2 — ressource de pack : le manifeste, l'atlas du corps et l'atlas
// d'émission, découpés en sprites.
//
// Les deux passes partagent exactement la même grille : la passe lumineuse
// accompagne les mêmes douze instants, elle n'ajoute pas d'images.

using UnityEngine;

namespace MotorFx
{
    [CreateAssetMenu(menuName = "MOTORFX2/Pack de sort", fileName = "MotorFxPack")]
    public class MotorFxPack : ScriptableObject
    {
        [Tooltip("Le fichier .manifest.json produit par l'export.")]
        public TextAsset manifestJson;

        [Tooltip("Sprites du corps, dans l'ordre (direction, image) de l'atlas.")]
        public Sprite[] bodySprites;

        [Tooltip("Sprites de la passe lumineuse. Facultatif : le corps doit rester lisible sans elle.")]
        public Sprite[] emissionSprites;

        private MotorFxManifest _manifest;

        public MotorFxManifest Manifest
        {
            get
            {
                if (_manifest == null && manifestJson != null)
                {
                    _manifest = MotorFxManifest.Parse(manifestJson.text);
                }
                return _manifest;
            }
        }

        public Sprite Body(int direction, int frame)
        {
            var index = Manifest.CellIndex(direction, frame);
            return index >= 0 && index < bodySprites.Length ? bodySprites[index] : null;
        }

        public Sprite Emission(int direction, int frame)
        {
            if (emissionSprites == null || emissionSprites.Length == 0) return null;
            var index = Manifest.CellIndex(direction, frame);
            return index >= 0 && index < emissionSprites.Length ? emissionSprites[index] : null;
        }

        /// <summary>Contrôle de cohérence : autant de sprites que de cellules déclarées.</summary>
        public bool Validate(out string reason)
        {
            if (manifestJson == null)
            {
                reason = "Manifeste absent";
                return false;
            }
            var expected = Manifest.directions.Length * Manifest.animation.framesPerDirection;
            if (bodySprites == null || bodySprites.Length != expected)
            {
                reason = $"Le pack déclare {expected} cellules, l'atlas du corps en fournit {bodySprites?.Length ?? 0}";
                return false;
            }
            if (emissionSprites != null && emissionSprites.Length != 0 && emissionSprites.Length != expected)
            {
                reason = $"La passe lumineuse fournit {emissionSprites.Length} cellules au lieu de {expected}";
                return false;
            }
            reason = null;
            return true;
        }
    }
}
