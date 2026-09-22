import SwiftUI
import UIKit

/// Dresses the UIKit controls SwiftUI draws with — navigation titles,
/// segmented pickers, the tab bar — in the app's palette and serif, so no
/// system blue or bold sans heading leaks into a screen that is otherwise
/// warm paper. Called once at launch.
enum SystemAppearance {
    @MainActor
    static func apply() {
        let ink = UIColor(Palette.ink)

        // Large titles in the display serif, like the web's Fraunces
        // headings; the bar itself stays transparent over the paper.
        let large = serif(size: 32, weight: .regular)
        let inline = serif(size: 17, weight: .semibold)
        let scrollEdge = UINavigationBarAppearance()
        scrollEdge.configureWithTransparentBackground()
        scrollEdge.largeTitleTextAttributes = [.font: large, .foregroundColor: ink]
        scrollEdge.titleTextAttributes = [.font: inline, .foregroundColor: ink]

        let standard = UINavigationBarAppearance()
        standard.configureWithDefaultBackground()
        standard.backgroundColor = UIColor(Palette.cream).withAlphaComponent(0.92)
        standard.shadowColor = UIColor(Palette.ash200).withAlphaComponent(0.6)
        standard.largeTitleTextAttributes = scrollEdge.largeTitleTextAttributes
        standard.titleTextAttributes = scrollEdge.titleTextAttributes

        let bar = UINavigationBar.appearance()
        bar.scrollEdgeAppearance = scrollEdge
        bar.standardAppearance = standard
        bar.compactAppearance = standard
        bar.tintColor = UIColor(Palette.plum400)

        // Segmented pickers: a paper track with a white thumb, plum type.
        let segmented = UISegmentedControl.appearance()
        segmented.selectedSegmentTintColor = .white
        segmented.backgroundColor = UIColor(Palette.cream200)
        segmented.setTitleTextAttributes(
            [.foregroundColor: ink, .font: UIFont.systemFont(ofSize: 13, weight: .medium)],
            for: .selected)
        segmented.setTitleTextAttributes(
            [.foregroundColor: UIColor(Palette.muted), .font: UIFont.systemFont(ofSize: 13)],
            for: .normal)

        // Unselected tab items in plum rather than black.
        let tabs = UITabBarAppearance()
        tabs.configureWithDefaultBackground()
        for layout in [tabs.stackedLayoutAppearance, tabs.inlineLayoutAppearance, tabs.compactInlineLayoutAppearance] {
            layout.normal.iconColor = UIColor(Palette.plum300)
            layout.normal.titleTextAttributes = [.foregroundColor: UIColor(Palette.plum300)]
        }
        UITabBar.appearance().standardAppearance = tabs
        UITabBar.appearance().scrollEdgeAppearance = tabs
        UITabBar.appearance().unselectedItemTintColor = UIColor(Palette.plum300)
    }

    private static func serif(size: CGFloat, weight: UIFont.Weight) -> UIFont {
        let base = UIFont.systemFont(ofSize: size, weight: weight)
        guard let descriptor = base.fontDescriptor.withDesign(.serif) else { return base }
        return UIFont(descriptor: descriptor, size: size)
    }
}
