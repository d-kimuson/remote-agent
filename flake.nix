{
  description = "Remote Agent with Hono and TanStack SPA";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    { nixpkgs, ... }:
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
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.gitleaks
              pkgs.git
              pkgs.nodejs
              pkgs.pnpm
            ];

            shellHook = ''
              echo "remote-agent dev shell"
              echo "  node  $(node --version)"
              echo "  pnpm  $(pnpm --version)"
            '';
          };
        }
      );
    };
}
