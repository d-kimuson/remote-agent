{
  description = "ACP playground with Hono and TanStack SPA";

  inputs = {
    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    { fenix, nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems =
        f:
        nixpkgs.lib.genAttrs systems (
          system:
          f
            system
            (
            import nixpkgs {
              inherit system;
              config.android_sdk.accept_license = true;
              config.allowUnfree = true;
            }
          )
        );
    in
    {
      devShells = forAllSystems (
        system: pkgs:
        let
          androidComposition = pkgs.androidenv.composeAndroidPackages {
            buildToolsVersions = [ "35.0.0" ];
            platformVersions = [ "35" ];
            includeNDK = true;
            ndkVersions = [ "27.2.12479018" ];
          };
          androidSdkRoot = "${androidComposition.androidsdk}/libexec/android-sdk";
          androidNdkRoot = "${androidSdkRoot}/ndk/27.2.12479018";
          fenixPackages = fenix.packages.${system};
          rustToolchain = fenixPackages.combine (
            [
              fenixPackages.stable.cargo
              fenixPackages.stable.clippy
              fenixPackages.stable.rust-src
              fenixPackages.stable.rust-std
              fenixPackages.stable.rustc
              fenixPackages.stable.rustfmt
            ]
            ++ pkgs.lib.optionals pkgs.stdenv.isLinux [
              fenixPackages.targets.aarch64-linux-android.stable.rust-std
            ]
            ++ pkgs.lib.optionals pkgs.stdenv.isDarwin [
              fenixPackages.targets.aarch64-apple-ios.stable.rust-std
              fenixPackages.targets.aarch64-apple-ios-sim.stable.rust-std
              fenixPackages.targets.x86_64-apple-ios.stable.rust-std
            ]
          );
        in
        {
          default = pkgs.mkShell {
            packages = [
              androidComposition.androidsdk
              pkgs.android-tools
              pkgs.cargo-ndk
              pkgs.clang
              pkgs.cmake
              pkgs.fontconfig.dev
              pkgs.git
              pkgs.jdk17_headless
              pkgs.nodejs
              pkgs.pkg-config
              pkgs.pnpm
              pkgs.rust-analyzer
              rustToolchain
            ];

            ANDROID_HOME = androidSdkRoot;
            ANDROID_SDK_ROOT = androidSdkRoot;
            ANDROID_NDK_HOME = androidNdkRoot;
            ANDROID_NDK_ROOT = androidNdkRoot;
            JAVA_HOME = "${pkgs.jdk17_headless.home}";
            LIBCLANG_PATH = "${pkgs.libclang.lib}/lib";
            PKG_CONFIG_PATH = "${pkgs.fontconfig.dev}/lib/pkgconfig";
            RUST_FONTCONFIG_DLOPEN = "1";

            shellHook = ''
              echo "acp-playground dev shell"
              echo "  node  $(node --version)"
              echo "  pnpm  $(pnpm --version)"
              echo "  rust  $(rustc --version)"
              echo "  cargo $(cargo --version)"
            '';
          };
        }
      );
    };
}
