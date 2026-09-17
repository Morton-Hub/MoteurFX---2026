// MOTORFX2 — importeur d'un pack exporté.
//
// Il applique ce qu'un pixel art exige et qu'un import par défaut casse :
// filtrage Point, aucune compression, pixels par unité déduits du manifeste,
// et un pivot posé exactement là où le moteur l'a déclaré — sinon un
// changement de cap fait sauter le sprite d'un pixel.
//
// Le découpage suit les cellules du manifeste, pas une grille devinée.

using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace MotorFx.EditorTools
{
    public static class MotorFxImporter
    {
        [MenuItem("MOTORFX2/Importer un pack…")]
        public static void ImportPack()
        {
            var manifestPath = EditorUtility.OpenFilePanel("Manifeste MOTORFX2", Application.dataPath, "json");
            if (string.IsNullOrEmpty(manifestPath)) return;
            var assetPath = ToAssetPath(manifestPath);
            if (assetPath == null)
            {
                EditorUtility.DisplayDialog(
                    "MOTORFX2",
                    "Le pack doit se trouver dans le dossier Assets du projet.",
                    "Compris");
                return;
            }

            var manifest = MotorFxManifest.Parse(File.ReadAllText(manifestPath));
            var folder = Path.GetDirectoryName(assetPath).Replace('\\', '/');

            var sprites = new Dictionary<string, Sprite[]>();
            foreach (var pass in manifest.passes)
            {
                var texturePath = $"{folder}/{pass.file}";
                var slices = SliceAtlas(texturePath, manifest, pass.name);
                if (slices != null) sprites[pass.name] = slices;
            }

            var pack = ScriptableObject.CreateInstance<MotorFxPack>();
            pack.manifestJson = AssetDatabase.LoadAssetAtPath<TextAsset>(assetPath);
            pack.bodySprites = sprites.TryGetValue("body", out var body) ? body : new Sprite[0];
            pack.emissionSprites = sprites.TryGetValue("emission", out var emission) ? emission : new Sprite[0];
            var packPath = $"{folder}/{manifest.recipe.id}-pack.asset";
            AssetDatabase.CreateAsset(pack, packPath);
            AssetDatabase.SaveAssets();

            if (!pack.Validate(out var reason))
            {
                Debug.LogWarning($"MOTORFX2 : pack importé avec une réserve — {reason}");
            }
            else
            {
                Debug.Log(
                    $"MOTORFX2 : {manifest.recipe.name} importé — {manifest.directions.Length} caps × " +
                    $"{manifest.animation.framesPerDirection} images, {manifest.animation.totalDurationMs} ms.");
            }
            Selection.activeObject = pack;
        }

        private static Sprite[] SliceAtlas(string texturePath, MotorFxManifest manifest, string pass)
        {
            var importer = AssetImporter.GetAtPath(texturePath) as TextureImporter;
            if (importer == null)
            {
                Debug.LogWarning($"MOTORFX2 : atlas introuvable pour la passe {pass} ({texturePath})");
                return null;
            }

            importer.textureType = TextureImporterType.Sprite;
            importer.spriteImportMode = SpriteImportMode.Multiple;
            importer.filterMode = FilterMode.Point;
            importer.mipmapEnabled = false;
            importer.alphaIsTransparency = true;
            // Alpha droit : l'export ne prémultiplie pas.
            importer.sRGBTexture = true;
            importer.spritePixelsPerUnit = manifest.projection.pixelsPerTile;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            importer.maxTextureSize = 8192;

            var height = manifest.atlas.rows * (manifest.atlas.cellHeight + manifest.atlas.padding * 2);
            var metas = new List<SpriteMetaData>(manifest.atlas.cells.Length);
            foreach (var cell in manifest.atlas.cells)
            {
                var meta = new SpriteMetaData
                {
                    name = $"{manifest.recipe.id}_{pass}_d{cell.direction:D2}_f{cell.frame:D2}",
                    // Unity compte les Y depuis le bas ; l'atlas depuis le haut.
                    rect = new Rect(cell.x, height - cell.y - cell.h, cell.w, cell.h),
                    alignment = (int)SpriteAlignment.Custom,
                    pivot = new Vector2(
                        (float)cell.pivotX / cell.w,
                        1f - (float)cell.pivotY / cell.h)
                };
                metas.Add(meta);
            }

#pragma warning disable CS0618 // spritesheet reste l'API la plus directe pour un découpage déclaré
            importer.spritesheet = metas.ToArray();
#pragma warning restore CS0618
            EditorUtility.SetDirty(importer);
            importer.SaveAndReimport();

            var assets = AssetDatabase.LoadAllAssetsAtPath(texturePath);
            var byName = new Dictionary<string, Sprite>();
            foreach (var asset in assets)
            {
                if (asset is Sprite sprite) byName[sprite.name] = sprite;
            }
            var ordered = new Sprite[manifest.atlas.cells.Length];
            for (var i = 0; i < metas.Count; i++)
            {
                byName.TryGetValue(metas[i].name, out var sprite);
                ordered[i] = sprite;
            }
            return ordered;
        }

        private static string ToAssetPath(string absolute)
        {
            absolute = absolute.Replace('\\', '/');
            var root = Application.dataPath.Replace('\\', '/');
            return absolute.StartsWith(root) ? "Assets" + absolute.Substring(root.Length) : null;
        }
    }
}
