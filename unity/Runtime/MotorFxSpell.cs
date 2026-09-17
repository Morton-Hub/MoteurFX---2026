// MOTORFX2 — assemblage runtime d'un sort.
//
// Le montage distingue le sol et la hauteur, déclenche le contact au bon
// moment et **ne décide pas des dégâts** : le gameplay reste maître. Les
// dessins de vol peuvent être répétés sans ajouter de cellules d'atlas ; le
// contact déclenche la plage d'impact.

using System;
using System.Collections;
using UnityEngine;

namespace MotorFx
{
    public class MotorFxSpell : MonoBehaviour
    {
        public MotorFxPack pack;
        public Transform source;
        public Transform target;

        [Tooltip("Vitesse du projectile, en tuiles par seconde. Le dessin ne dicte pas la distance.")]
        public float projectileTilesPerSecond = 9f;

        [Tooltip("Renderer du corps. Un second renderer peut recevoir la passe lumineuse.")]
        public MotorFxPlayer player;

        /// <summary>Déclenché à l'instant de contact déclaré par le manifeste.</summary>
        public event Action OnContact;

        public void Cast()
        {
            StopAllCoroutines();
            StartCoroutine(Run());
        }

        private IEnumerator Run()
        {
            if (pack == null || player == null || pack.Manifest == null) yield break;
            var manifest = pack.Manifest;
            var heading = Heading();
            player.pack = pack;
            player.headingDegrees = heading;

            yield return Play("cast", source != null ? source.position : transform.position);

            var fly = manifest.Clip("fly");
            if (fly != null && source != null && target != null)
            {
                // La position avance à la fréquence du jeu tandis que le dessin
                // change selon la timeline : la trajectoire est continue sans
                // inventer d'images.
                var from = source.position;
                var to = target.position;
                var tiles = Vector3.Distance(from, to);
                var travel = tiles / Mathf.Max(0.01f, projectileTilesPerSecond);
                var elapsed = 0f;
                player.role = "fly";
                player.Rewind();
                while (elapsed < travel)
                {
                    elapsed += Time.deltaTime;
                    player.transform.position = Vector3.Lerp(from, to, Mathf.Clamp01(elapsed / travel));
                    yield return null;
                }
            }

            OnContact?.Invoke();
            yield return Play("hit", target != null ? target.position : transform.position);
            yield return Play("residue", target != null ? target.position : transform.position);
        }

        private IEnumerator Play(string role, Vector3 at)
        {
            var clip = pack.Manifest.Clip(role);
            if (clip == null) yield break;
            player.role = role;
            player.transform.position = at;
            player.Rewind();
            yield return new WaitForSeconds(pack.Manifest.ClipSeconds(clip));
        }

        private float Heading()
        {
            if (source == null || target == null) return player != null ? player.headingDegrees : 0f;
            var delta = target.position - source.position;
            // Le cap est mesuré dans le plan du sol. Source et cible confondues
            // conservent le cap précédent plutôt que de produire une valeur folle.
            if (delta.sqrMagnitude < 1e-6f) return player.headingDegrees;
            return Mathf.Atan2(delta.z, delta.x) * Mathf.Rad2Deg;
        }
    }
}
